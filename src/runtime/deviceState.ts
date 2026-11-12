// State that belongs to this device only. It lives in Obsidian's per-device local storage,
// never in data.json, so one device pausing or switching off auto-sync never affects another.

import type { PocketTag } from "../model";
import type { FolderNode } from "../pocket/folders";
import type { SyncReport } from "../sync/report";
import type { SyncStatus } from "../sync/service";

export const KEY_PREFIX = "pocket-recordings:";
/** Consecutive aborted runs before auto-sync pauses. */
export const PAUSE_AFTER = 3;

export interface LocalStore {
	load(key: string): unknown;
	save(key: string, value: unknown): void;
}

export interface LastSync {
	at: number;
	status: SyncStatus;
	message: string | null;
}

export class DeviceState {
	constructor(
		private readonly store: LocalStore,
		private readonly isMobile: boolean,
	) {}

	private get<T>(name: string, check: (value: unknown) => value is T, fallback: T): T {
		const value = this.store.load(KEY_PREFIX + name);
		return check(value) ? value : fallback;
	}

	private set(name: string, value: unknown): void {
		this.store.save(KEY_PREFIX + name, value);
	}

	/** On by default on desktop, off on mobile. */
	get autoSync(): boolean {
		return this.get("auto-sync", isBoolean, !this.isMobile);
	}

	setAutoSync(on: boolean): void {
		this.set("auto-sync", on);
	}

	get failures(): number {
		return this.get("failures", isNumber, 0);
	}

	get paused(): boolean {
		return this.get("paused", isBoolean, false);
	}

	/**
	 * Records a run's outcome and returns whether this run paused auto-sync. A 401 pauses at once; an
	 * aborted run counts toward the pause; a completed run resets the count, and a completed manual
	 * run resumes a paused device. Per-recording errors inside a completed run never count.
	 */
	recordOutcome(status: SyncStatus, manual: boolean): { pausedNow: boolean } {
		const wasPaused = this.paused;
		switch (status) {
			case "ok":
				this.set("failures", 0);
				if (manual && wasPaused) this.set("paused", false);
				return { pausedNow: false };
			case "auth":
				this.set("failures", Math.max(this.failures + 1, PAUSE_AFTER));
				this.set("paused", true);
				return { pausedNow: !wasPaused };
			case "aborted": {
				const failures = this.failures + 1;
				this.set("failures", failures);
				if (failures >= PAUSE_AFTER) this.set("paused", true);
				return { pausedNow: !wasPaused && failures >= PAUSE_AFTER };
			}
			case "cancelled":
				return { pausedNow: false };
		}
	}

	resume(): void {
		this.set("paused", false);
		this.set("failures", 0);
	}

	get lastSync(): LastSync | null {
		return this.get("last-sync", isLastSync, null);
	}

	setLastSync(lastSync: LastSync): void {
		this.set("last-sync", lastSync);
	}

	get lastReport(): SyncReport | null {
		return this.get("last-report", isReport, null);
	}

	setLastReport(report: SyncReport): void {
		this.set("last-report", report);
	}

	/** Pocket's folder tree from the last successful read, for offline Apply counts and pickers. */
	get cachedFolders(): FolderNode[] | null {
		return this.get("folders", isFolderNodes, null);
	}

	setCachedFolders(nodes: FolderNode[]): void {
		this.set("folders", nodes);
	}

	/** Pocket's tags from the last read, for showing picked tag filters by name. */
	get cachedTags(): PocketTag[] | null {
		return this.get("tags", isTags, null);
	}

	setCachedTags(tags: PocketTag[]): void {
		this.set("tags", tags);
	}
}

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isLastSync = (value: unknown): value is LastSync => typeof value === "object" && value !== null && typeof (value as LastSync).at === "number";
const isReport = (value: unknown): value is SyncReport => typeof value === "object" && value !== null && Array.isArray((value as SyncReport).created);
const isTags = (value: unknown): value is PocketTag[] => Array.isArray(value) && value.every((tag) => typeof (tag as PocketTag)?.id === "string" && typeof (tag as PocketTag)?.name === "string");
const isFolderNodes = (value: unknown): value is FolderNode[] => Array.isArray(value) && value.every((node) => typeof (node as FolderNode)?.id === "string");
