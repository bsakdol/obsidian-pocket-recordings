import { Modal, type App } from "obsidian";

/** Shows the diagnostics report in a read-only box, selected so the user can copy it by hand. */
export class DiagnosticsModal extends Modal {
	constructor(
		app: App,
		private readonly report: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Diagnostics");
		const { contentEl } = this;
		contentEl.createEl("p", { text: "Copy this report into your bug report. It does not include your API key, but error messages can include note and folder names, so read it before you share it." });
		const box = contentEl.createEl("textarea", { text: this.report, attr: { readonly: "true", rows: "16", cols: "50", spellcheck: "false" } });
		box.focus();
		box.select();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
