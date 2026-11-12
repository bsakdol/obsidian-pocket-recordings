// One sync run, in the order of the plan's design: guards, folders, listing, scope, details,
// plan, execute, report. Obsidian-free: everything outside the engine is injected.

import type { RecordingDetail } from "../model";
import { PocketClient } from "../pocket/api";
import { AuthError, PocketError, RateLimitBudgetError } from "../pocket/errors";
import type { FolderTree } from "../pocket/folders";
import { DESKTOP_RUN_BUDGET_MS, MOBILE_RUN_BUDGET_MS, RateLimitBudget } from "../pocket/rateLimit";
import type { Requester } from "../pocket/transport";
import { renderFingerprint } from "../settings/fingerprint";
import type { Settings } from "../settings/schema";
import type { VaultOps } from "../vault/vaultOps";
import { checkBaseFolder } from "./baseGuard";
import { execute } from "./executor";
import { buildIndexWhenReady, VaultIndexingError } from "./identityIndex";
import { needsDetails, planOps, type PlanInput } from "./planner";
import { emptyReport, type SyncReport } from "./report";
import { classify, horizonStart, listingStartDate, usesFolderFilters } from "./scope";

export interface SyncOptions {
	/** Started by the user (command or ribbon) rather than the scheduler. */
	manual: boolean;
	/** "Re-sync everything": refetch and rewrite every in-scope recording. */
	resyncAll: boolean;
}

export function mergeOptions(a: SyncOptions, b: SyncOptions): SyncOptions {
	return { manual: a.manual || b.manual, resyncAll: a.resyncAll || b.resyncAll };
}

/**
 * - `ok`: the run completed; per-recording errors and an incomplete run are in the report.
 * - `aborted`: a guard or a failed listing stopped the run before any write.
 * - `auth`: Pocket rejected the key; the run stopped before any write.
 * - `cancelled`: the plugin unloaded mid-run.
 */
export type SyncStatus = "ok" | "aborted" | "auth" | "cancelled";

export interface SyncOutcome {
	status: SyncStatus;
	report: SyncReport;
	/** Why the run did not complete, for notices and the status bar. */
	message: string | null;
}

export interface SyncDeps {
	vault: VaultOps;
	request: Requester;
	/** The API key from secret storage, or null when none is set. */
	apiKey: () => string | null;
	/**
	 * The effective settings for this run. Called once per run, after which the run confirms the
	 * structure it uses (first run) and captures the vault time zone when it is unset.
	 */
	prepareSettings: () => Promise<Settings>;
	waitForResolved: () => Promise<void>;
	now: () => number;
	isMobile: boolean;
	/** Becomes true when the plugin unloads. */
	cancelled: () => boolean;
	sleep?: (ms: number) => Promise<void>;
	log?: (message: string, details?: unknown) => void;
	/** Receives the folder tree after each successful read, for the device's offline cache. */
	onFolders?: (tree: FolderTree) => void;
}

function stop(status: SyncStatus, message: string, report = emptyReport()): SyncOutcome {
	return { status, report, message };
}

export async function runSync(deps: SyncDeps, options: SyncOptions): Promise<SyncOutcome> {
	const log = deps.log ?? (() => {});
	const key = deps.apiKey()?.trim();
	if (!key) return stop("aborted", "Add your Pocket API key in settings first.");

	const settings = await deps.prepareSettings();
	const budget = new RateLimitBudget(deps.isMobile ? MOBILE_RUN_BUDGET_MS : DESKTOP_RUN_BUDGET_MS);
	const client = new PocketClient(key, { request: deps.request, sleep: deps.sleep, now: deps.now, budget, onWait: (ms) => log("Waiting out a Pocket rate limit", { ms }) });

	try {
		// The index waits for a complete metadata cache, so notes are never mistaken for missing.
		const index = await buildIndexWhenReady(deps.vault, deps.waitForResolved);
		const guard = checkBaseFolder(index.files, settings.baseFolder);
		if (!guard.ok) return stop("aborted", guard.message);
		if (deps.cancelled()) return stop("cancelled", "Sync stopped.");

		// Paths and folder filters depend on the folder tree; never guess them from a failed read.
		const needsTree = settings.scheme === "pocket-folders" || usesFolderFilters(settings);
		let tree: FolderTree | null = null;
		try {
			tree = await client.listFolders();
			deps.onFolders?.(tree);
		} catch (error) {
			if (error instanceof AuthError) throw error;
			if (needsTree) return stop("aborted", `Could not read your Pocket folders, so nothing was changed. ${messageOf(error)}`);
			log("Folder tree unavailable; continuing without it", messageOf(error));
		}

		const nowMs = deps.now();
		const start = horizonStart(settings, nowMs);
		// Any failed page aborts here, so every run that writes has a complete listing.
		const listing = await client.listAll(listingStartDate(start));
		if (deps.cancelled()) return stop("cancelled", "Sync stopped.");

		const input: PlanInput = {
			scoped: classify(listing, settings, tree, nowMs),
			index,
			settings,
			tree,
			renderFingerprint: renderFingerprint(settings),
			horizonStartMs: start,
			resyncAll: options.resyncAll,
		};
		const report = emptyReport();
		const details = new Map<string, RecordingDetail>();
		// One at a time; a failing recording is skipped and reported, and the run goes on.
		for (const recording of needsDetails(input)) {
			if (deps.cancelled()) return stop("cancelled", "Sync stopped.");
			try {
				details.set(recording.id, await client.getDetail(recording));
			} catch (error) {
				if (error instanceof AuthError) throw error;
				if (error instanceof RateLimitBudgetError) {
					report.incomplete = error.message;
					break;
				}
				report.errors.push({ identity: `id:${recording.id}`, message: `${recording.title || recording.id}: ${messageOf(error)}` });
			}
		}

		const plan = planOps(input, details);
		const executed = await execute(plan, deps.vault, deps.cancelled);
		executed.errors.unshift(...report.errors);
		executed.incomplete = report.incomplete;
		if (deps.cancelled()) return stop("cancelled", "Sync stopped.", executed);
		return { status: "ok", report: executed, message: null };
	} catch (error) {
		if (error instanceof AuthError) return stop("auth", error.message);
		if (error instanceof VaultIndexingError) return stop("aborted", error.message);
		if (error instanceof PocketError) return stop("aborted", `Sync stopped before changing anything. ${error.message}`);
		throw error;
	}
}

export function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Lists folders once, for "Test connection". Returns the folder count on success. */
export async function testConnection(apiKey: string, request: Requester): Promise<{ ok: true; folders: number } | { ok: false; message: string }> {
	const client = new PocketClient(apiKey, { request, budget: new RateLimitBudget(10_000) });
	try {
		const tree = await client.listFolders();
		return { ok: true, folders: tree.all().length };
	} catch (error) {
		return { ok: false, message: messageOf(error) };
	}
}
