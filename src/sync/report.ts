/** What one sync did, by the categories the user can review. Paths are vault paths. */
export interface SyncReport {
	created: string[];
	updated: string[];
	unchanged: number;
	relocated: string[];
	userMoved: string[];
	deleted: string[];
	excluded: string[];
	superseded: string[];
	/** Damaged markers, inconsistent properties, or a target path already taken. */
	conflicts: { path: string; reason: string }[];
	/** Each entry lists the notes claiming one identity and role. */
	duplicates: string[][];
	frozen: string[];
	errors: { message: string; identity?: string }[];
	/** Set when the run stopped early (rate-limit budget) and the next sync continues. */
	incomplete: string | null;
}

export function emptyReport(): SyncReport {
	return {
		created: [],
		updated: [],
		unchanged: 0,
		relocated: [],
		userMoved: [],
		deleted: [],
		excluded: [],
		superseded: [],
		conflicts: [],
		duplicates: [],
		frozen: [],
		errors: [],
		incomplete: null,
	};
}

/** Whether the run changed any file. */
export function hasChanges(report: SyncReport): boolean {
	return (
		report.created.length + report.updated.length + report.relocated.length + report.deleted.length + report.excluded.length + report.superseded.length >
		0
	);
}

/** Whether there is anything for the user to look at beyond "nothing changed". */
export function isQuiet(report: SyncReport): boolean {
	return (
		!hasChanges(report) &&
		report.userMoved.length + report.conflicts.length + report.duplicates.length + report.frozen.length + report.errors.length === 0 &&
		report.incomplete === null
	);
}

/** A one-line summary for notices and the status bar. */
export function summarize(report: SyncReport): string {
	const parts: string[] = [];
	const add = (count: number, label: string): void => {
		if (count > 0) parts.push(`${count} ${label}`);
	};
	add(report.created.length, "created");
	add(report.updated.length, "updated");
	add(report.relocated.length, "moved");
	add(report.deleted.length, "marked deleted");
	add(report.excluded.length, "marked excluded");
	add(report.superseded.length, "superseded");
	add(report.conflicts.length, report.conflicts.length === 1 ? "conflict" : "conflicts");
	add(report.duplicates.length, report.duplicates.length === 1 ? "duplicate" : "duplicates");
	add(report.errors.length, report.errors.length === 1 ? "error" : "errors");
	const text = parts.length > 0 ? parts.join(", ") : "Nothing changed";
	return report.incomplete ? `${text} (incomplete: continues next sync)` : text;
}
