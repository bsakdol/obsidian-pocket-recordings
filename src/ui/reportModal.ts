import { Modal, type App } from "obsidian";

import { isQuiet, summarize, type SyncReport } from "../sync/report";

export interface ReportSection {
	title: string;
	/** Note paths, each with an optional detail. */
	items: { path: string; detail?: string }[];
	/** For categories reported as a count only. */
	count?: number;
}

/** The report's categories in reading order, leaving out empty ones. */
export function reportSections(report: SyncReport): ReportSection[] {
	const paths = (title: string, list: string[]): ReportSection => ({ title, items: list.map((path) => ({ path })) });
	const sections: ReportSection[] = [
		paths("Created", report.created),
		paths("Updated", report.updated),
		paths("Moved to follow Pocket", report.relocated),
		paths("Moved by you (left in place)", report.userMoved),
		paths("Deleted in Pocket (marked)", report.deleted),
		paths("Excluded by filters (marked)", report.excluded),
		paths("No longer used (marked superseded)", report.superseded),
		{ title: "Conflicts (skipped)", items: report.conflicts.map((c) => ({ path: c.path, detail: c.reason })) },
		{ title: "Duplicates (left alone)", items: report.duplicates.flatMap((group) => group.map((path) => ({ path, detail: `one of ${group.length} notes for the same recording` }))) },
		paths("Frozen (not updated)", report.frozen),
		{ title: "Errors", items: report.errors.map((e) => ({ path: "", detail: e.message })) },
	];
	const nonEmpty = sections.filter((section) => section.items.length > 0);
	if (report.unchanged > 0) nonEmpty.push({ title: "Unchanged", items: [], count: report.unchanged });
	return nonEmpty;
}

export function reportHeadline(report: SyncReport | null): string {
	if (!report) return "No sync has run on this device yet.";
	if (isQuiet(report)) return "Nothing changed.";
	return `${summarize(report)}.`;
}

/** Shows the last sync's report, with links to the affected notes. */
export class ReportModal extends Modal {
	constructor(
		app: App,
		private readonly report: SyncReport | null,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Last sync report");
		const { contentEl } = this;
		contentEl.createEl("p", { text: reportHeadline(this.report) });
		if (this.report?.incomplete) contentEl.createEl("p", { text: this.report.incomplete });
		if (!this.report) return;
		for (const section of reportSections(this.report)) {
			contentEl.createEl("h4", { text: section.count !== undefined ? `${section.title}: ${section.count}` : `${section.title} (${section.items.length})` });
			if (section.items.length === 0) continue;
			const list = contentEl.createEl("ul");
			for (const item of section.items) {
				const li = list.createEl("li");
				if (item.path) {
					const link = li.createEl("a", { text: item.path.replace(/\.md$/, ""), href: "#" });
					link.addEventListener("click", (event) => {
						event.preventDefault();
						void this.app.workspace.openLinkText(item.path, "", false);
						this.close();
					});
				}
				if (item.detail) li.createSpan({ text: item.path ? ` — ${item.detail}` : item.detail });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
