import { summarize } from "../sync/report";
import type { SyncOutcome } from "../sync/service";
import type { LastSync } from "./deviceState";

export interface StatusState {
	running: boolean;
	paused: boolean;
	autoSync: boolean;
	last: LastSync | null;
}

function time(at: number): string {
	const date = new Date(at);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** The desktop status bar text: running state, last sync time, and any error. */
export function statusText(state: StatusState): string {
	if (state.running) return "Pocket: syncing…";
	if (state.paused) return "Pocket: auto-sync paused";
	const last = state.last;
	if (!last) return state.autoSync ? "Pocket: not synced yet" : "Pocket: manual sync";
	if (last.status === "ok") return `Pocket: synced ${time(last.at)}`;
	if (last.status === "cancelled") return `Pocket: stopped ${time(last.at)}`;
	return `Pocket: sync failed ${time(last.at)}`;
}

export function statusTooltip(state: StatusState): string {
	const last = state.last;
	const lines = [last?.message ?? (last ? "Last sync completed." : "No sync has run on this device yet.")];
	if (state.paused) lines.push("Auto-sync paused after repeated failures. A successful manual sync resumes it.");
	return lines.join("\n");
}

/**
 * The notice for a finished run, or null for none: manual runs always get one, scheduled runs
 * only when they fail or pause auto-sync.
 */
export function noticeFor(outcome: SyncOutcome, manual: boolean, pausedNow: boolean): string | null {
	const paused = pausedNow ? " Auto-sync is paused on this device until a manual sync succeeds." : "";
	if (outcome.status === "ok") {
		return manual ? `Pocket sync: ${summarize(outcome.report)}` : null;
	}
	if (outcome.status === "cancelled") return null;
	return `Pocket sync stopped: ${outcome.message ?? "unknown error"}${paused}`;
}
