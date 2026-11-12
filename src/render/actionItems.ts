import type { ActionItem } from "../model";
import type { Settings } from "../settings/schema";
import { fnv1a } from "../util/hash";
import { neutralizeMarkers } from "./markers";

const TICKED_PREFIX = "%% pocket-recordings:ticked";

/**
 * The block id for a Pocket action item. Block ids allow only letters, digits, and dashes;
 * when anything had to be replaced, a hash of the original id keeps the result unique and stable.
 */
export function blockId(itemId: string): string {
	const safe = itemId.replace(/[^A-Za-z0-9-]/g, "-");
	return safe === itemId ? `pocket-${safe}` : `pocket-${safe}-${fnv1a(itemId).slice(0, 6)}`;
}

/**
 * The block ids the user ticked in a region: checked items, plus the ticked items hidden by "hide
 * completed", which are remembered in a comment line so the tick survives the next rewrite.
 */
export function collectTicks(region: string): Set<string> {
	const ticked = new Set<string>();
	for (const line of region.split("\n")) {
		const item = /^\s*[-*+] \[[xX]\] .*\^(pocket-[A-Za-z0-9-]+)\s*$/.exec(line);
		if (item?.[1]) ticked.add(item[1]);
		if (line.trim().startsWith(TICKED_PREFIX)) {
			for (const id of line.match(/pocket-[A-Za-z0-9-]+/g) ?? []) if (id !== "pocket-recordings") ticked.add(id);
		}
	}
	return ticked;
}

/** One checklist line per item; checked when Pocket says complete or the user ticked it. */
export function renderActionItems(items: ActionItem[], settings: Settings, ticks: ReadonlySet<string>): string {
	const lines: string[] = [];
	const hidden: string[] = [];
	for (const item of items) {
		const id = blockId(item.id);
		const done = item.completed || ticks.has(id);
		if (done && settings.hideCompletedActionItems) {
			// Only local ticks need remembering; Pocket's own completion comes back every render.
			if (!item.completed) hidden.push(id);
			continue;
		}
		let text = neutralizeMarkers(item.title.replace(/\s+/g, " "));
		if (settings.actionItemDueDates && item.dueDate) text += ` (due ${item.dueDate.slice(0, 10)})`;
		if (settings.actionItemStatus && item.status) text += ` — ${item.status}`;
		lines.push(`- [${done ? "x" : " "}] ${text} ^${id}`);
	}
	if (hidden.length > 0) lines.push(`${TICKED_PREFIX} ${hidden.join(" ")} %%`);
	return lines.join("\n");
}
