import { FuzzySuggestModal, type App } from "obsidian";

import type { PocketTag } from "../model";
import type { FolderTree } from "../pocket/folders";
import { UNFILED_ID } from "./schema";

export interface PickerItem {
	id: string;
	label: string;
}

/** A label for a picked folder id, from the device's cached tree when it has one. */
export function folderLabel(id: string, tree: FolderTree | null): string {
	if (id === UNFILED_ID) return "Unfiled";
	return tree?.get(id) ? tree.displayPath(id) : `Folder not found in Pocket (${id.slice(0, 8)})`;
}

/** A label for a picked tag id, from the device's cached tags when it has them. */
export function tagLabel(id: string, tags: PocketTag[] | null): string {
	return tags?.find((tag) => tag.id === id)?.name ?? `Tag not found in Pocket (${id.slice(0, 8)})`;
}

/** Every folder, plus Unfiled, that is not already picked in either list, sorted by path. */
export function folderChoices(tree: FolderTree, taken: ReadonlySet<string>): PickerItem[] {
	return [{ id: UNFILED_ID, label: "Unfiled" }, ...tree.all().map((node) => ({ id: node.id, label: tree.displayPath(node.id) }))]
		.filter((item) => !taken.has(item.id))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** Every tag not already picked in either list, sorted by name. */
export function tagChoices(tags: PocketTag[], taken: ReadonlySet<string>): PickerItem[] {
	return tags
		.filter((tag) => !taken.has(tag.id))
		.map((tag) => ({ id: tag.id, label: tag.name }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** Type to find one folder or tag, then Enter to pick it. */
export class PickModal extends FuzzySuggestModal<PickerItem> {
	constructor(
		app: App,
		private readonly items: PickerItem[],
		placeholder: string,
		empty: string,
		private readonly onPick: (item: PickerItem) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
		this.emptyStateText = empty;
	}

	getItems(): PickerItem[] {
		return this.items;
	}

	getItemText(item: PickerItem): string {
		return item.label;
	}

	onChooseItem(item: PickerItem): void {
		this.onPick(item);
	}
}
