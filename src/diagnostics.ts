import type { LastSync } from "./runtime/deviceState";
import type { Settings } from "./settings/schema";
import type { SyncReport } from "./sync/report";

export interface DiagnosticsInput {
	pluginVersion: string;
	appVersion: string;
	platform: string;
	settings: Settings;
	structureDraftPending: boolean;
	device: { autoSync: boolean; paused: boolean; failures: number; lastSync: LastSync | null };
	lastReport: SyncReport | null;
	recentErrors: string[];
	/** Values that must never appear in the output: the API key itself. */
	secrets: string[];
}

const KEY_PATTERN = /\bpk_[A-Za-z0-9_-]{4,}/g;

/** Removes every secret, and anything shaped like a Pocket key, from `text`. */
export function redact(text: string, secrets: string[]): string {
	let out = text;
	for (const secret of secrets.filter((value) => value.length >= 4)) out = out.split(secret).join("[redacted]");
	return out.replace(KEY_PATTERN, "[redacted]");
}

/**
 * A plain-text report for bug reports. It holds versions, settings with the key's secret id
 * reduced to "set" or "not set", device state, the last report's counts (no note names), and recent
 * errors, all redacted.
 */
export function buildDiagnostics(input: DiagnosticsInput): string {
	const { settings } = input;
	const safeSettings: Record<string, unknown> = { ...settings, apiKeySecret: settings.apiKeySecret ? "(set)" : "(not set)" };
	const report = input.lastReport;
	const counts = report
		? {
				created: report.created.length,
				updated: report.updated.length,
				unchanged: report.unchanged,
				relocated: report.relocated.length,
				userMoved: report.userMoved.length,
				deleted: report.deleted.length,
				excluded: report.excluded.length,
				superseded: report.superseded.length,
				conflicts: report.conflicts.length,
				duplicates: report.duplicates.length,
				frozen: report.frozen.length,
				errors: report.errors.length,
				incomplete: report.incomplete !== null,
			}
		: null;
	const lines = [
		"# Pocket Recordings diagnostics",
		"",
		`- Plugin version: ${input.pluginVersion}`,
		`- Obsidian version: ${input.appVersion}`,
		`- Platform: ${input.platform}`,
		`- Auto-sync on this device: ${input.device.autoSync ? "on" : "off"}${input.device.paused ? " (paused)" : ""}`,
		`- Consecutive failures: ${input.device.failures}`,
		`- Last sync: ${input.device.lastSync ? `${new Date(input.device.lastSync.at).toISOString()} ${input.device.lastSync.status}${input.device.lastSync.message ? ` (${input.device.lastSync.message})` : ""}` : "never"}`,
		`- Unapplied structure changes: ${input.structureDraftPending ? "yes" : "no"}`,
		"",
		"## Settings",
		"",
		"```json",
		JSON.stringify(safeSettings, null, 2),
		"```",
		"",
		"## Last sync report (counts)",
		"",
		"```json",
		JSON.stringify(counts, null, 2),
		"```",
		"",
		"## Recent errors",
		"",
		...(input.recentErrors.length > 0 ? input.recentErrors.map((error) => `- ${error}`) : ["- none"]),
		...(report && report.errors.length > 0 ? ["", "## Errors in the last sync", "", ...report.errors.map((error) => `- ${error.message}`)] : []),
	];
	return redact(lines.join("\n"), input.secrets);
}
