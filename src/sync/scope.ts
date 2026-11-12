import type { ListedRecording, RecordingKind } from "../model";
import type { FolderTree } from "../pocket/folders";
import { UNFILED_ID, type Settings } from "../settings/schema";

/** Extra days requested before the horizon, so date-boundary differences never drop a recording. */
export const LISTING_MARGIN_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * - `in-scope`: synced.
 * - `excluded`: filtered out; existing notes are marked excluded.
 * - `held`: Pocket is still processing it; left for a later sync.
 * - `out-of-horizon`: older than the horizon; left exactly as it is.
 */
export type ScopeClass = "in-scope" | "excluded" | "held" | "out-of-horizon";

export interface Scoped {
	recording: ListedRecording;
	kind: RecordingKind;
	scope: ScopeClass;
}

/** The earliest recording time in the horizon (epoch ms), or null for all history. */
export function horizonStart(settings: Settings, nowMs: number): number | null {
	switch (settings.horizon) {
		case "all":
			return null;
		case "days":
			return nowMs - settings.horizonDays * DAY_MS;
		case "since":
			return settings.horizonSince ? zonedMidnight(settings.horizonSince, settings.timeZone) : null;
	}
}

/** The listing's `start_date`: the horizon start minus the margin, as a UTC `YYYY-MM-DD`. */
export function listingStartDate(horizonStartMs: number | null): string | null {
	return horizonStartMs === null ? null : new Date(horizonStartMs - LISTING_MARGIN_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export function isInHorizon(recordedAt: string, horizonStartMs: number | null): boolean {
	if (horizonStartMs === null) return true;
	const time = Date.parse(recordedAt);
	return !Number.isNaN(time) && time >= horizonStartMs;
}

/** A recording is an insight when it carries the insights tag. */
export function kindOf(recording: Pick<ListedRecording, "tags">, settings: Settings): RecordingKind {
	const tag = settings.insightsTag.trim().toLowerCase();
	return recording.tags.some((t) => t.name.toLowerCase() === tag || t.id.toLowerCase() === tag) ? "insight" : "conversation";
}

/** Whether the folder filters admit a conversation. Include covers descendants; exclude wins. */
export function passesFolderFilters(folderId: string | null, settings: Settings, tree: FolderTree | null): boolean {
	const include = settings.includeFolderIds;
	const exclude = settings.excludeFolderIds;
	if (include.length === 0 && exclude.length === 0) return true;
	const within = (pick: string): boolean => {
		if (pick === UNFILED_ID) return folderId === null;
		if (folderId === null || !tree) return false;
		return tree.isWithin(folderId, pick);
	};
	// A folder the tree does not know cannot be shown to be outside an excluded folder: fail closed.
	if (exclude.length > 0 && folderId !== null && (!tree || !tree.get(folderId))) return false;
	if (exclude.some(within)) return false;
	return include.length === 0 || include.some(within);
}

/** Whether the tag filters admit a recording. Tags are matched by id. */
export function passesTagFilters(recording: Pick<ListedRecording, "tags">, settings: Settings): boolean {
	const tagIds = new Set(recording.tags.map((tag) => tag.id));
	if (settings.excludeTagIds.some((id) => tagIds.has(id))) return false;
	return settings.includeTagIds.length === 0 || settings.includeTagIds.some((id) => tagIds.has(id));
}

/** Puts every listed recording in exactly one class. Filters run locally, never on the server. */
export function classify(listing: ListedRecording[], settings: Settings, tree: FolderTree | null, nowMs: number): Scoped[] {
	const start = horizonStart(settings, nowMs);
	return listing.map((recording) => {
		const kind = kindOf(recording, settings);
		let scope: ScopeClass;
		if (!isInHorizon(recording.recordingAt, start)) scope = "out-of-horizon";
		else if (!passesTagFilters(recording, settings)) scope = "excluded";
		// Insights ignore folder filters, matching how highlights are used across folders.
		else if (kind === "conversation" && !passesFolderFilters(recording.folderId, settings, tree)) scope = "excluded";
		else if (!recording.isFinished) scope = "held";
		else scope = "in-scope";
		return { recording, kind, scope };
	});
}

/** Whether any folder filter is set, which makes the folder tree required. */
export function usesFolderFilters(settings: Settings): boolean {
	return settings.includeFolderIds.length > 0 || settings.excludeFolderIds.length > 0;
}

/** Epoch ms of 00:00 on `date` (`YYYY-MM-DD`) in `zone`. */
function zonedMidnight(date: string, zone: string): number {
	const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
	const guess = Date.UTC(y, m - 1, d);
	if (!zone) return guess;
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
	const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
	const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
	return guess - (asUtc - guess);
}
