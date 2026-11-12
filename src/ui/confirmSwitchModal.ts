import { Modal, Setting, type App } from "obsidian";

/** Asks once before a structure change touches existing notes. Resolves to the user's answer. */
export function confirmSwitch(app: App, affected: number, userMoved: number): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmSwitchModal(app, affected, userMoved, resolve).open();
	});
}

class ConfirmSwitchModal extends Modal {
	private answered = false;

	constructor(
		app: App,
		private readonly affected: number,
		private readonly userMoved: number,
		private readonly resolve: (apply: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const recordings = `${this.affected} recording${this.affected === 1 ? "" : "s"}`;
		this.setTitle(`Apply to ${recordings}?`);
		this.contentEl.createEl("p", {
			text: "Notes the plugin placed will be moved or renamed to match. Files the new settings no longer use are marked superseded and left in place. Nothing is deleted.",
		});
		if (this.userMoved > 0) {
			this.contentEl.createEl("p", {
				text: `${this.userMoved} of them are in folders you moved them to. They stay where they are and keep updating.`,
			});
		}
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.answer(false)))
			.addButton((button) =>
				button
					.setButtonText("Apply")
					.setCta()
					.onClick(() => this.answer(true)),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.resolve(false);
	}

	private answer(apply: boolean): void {
		this.answered = true;
		this.resolve(apply);
		this.close();
	}
}
