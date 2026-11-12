import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionItem } from "../src/model";
import { blockId, collectTicks, renderActionItems } from "../src/render/actionItems";
import { settingsWith } from "./support/settings";

const item = (id: string, title: string, completed = false, extra: Partial<ActionItem> = {}): ActionItem => ({ id, title, completed, dueDate: null, status: null, assignee: null, ...extra });

test("Pocket open plus a local tick renders checked", () => {
	const items = [item("ai-1", "Send proposal")];
	const first = renderActionItems(items, settingsWith(), new Set());
	assert.equal(first, "- [ ] Send proposal ^pocket-ai-1");
	const ticked = first.replace("- [ ]", "- [x]");
	assert.equal(renderActionItems(items, settingsWith(), collectTicks(ticked)), "- [x] Send proposal ^pocket-ai-1");
});

test("Pocket complete with no local tick renders checked", () => {
	assert.equal(renderActionItems([item("ai-2", "Done", true)], settingsWith(), new Set()), "- [x] Done ^pocket-ai-2");
});

test("a locally ticked item that Pocket removed is not rendered", () => {
	assert.equal(renderActionItems([item("ai-3", "Kept")], settingsWith(), new Set(["pocket-ai-gone"])), "- [ ] Kept ^pocket-ai-3");
});

test("hide-completed omits checked items and remembers local ticks across rewrites", () => {
	const items = [item("ai-1", "Ticked here"), item("ai-2", "Done in Pocket", true), item("ai-3", "Open")];
	const settings = settingsWith({ hideCompletedActionItems: true });
	const first = renderActionItems(items, settings, new Set(["pocket-ai-1"]));
	assert.ok(!first.includes("Ticked here") && !first.includes("Done in Pocket"));
	assert.ok(first.includes("- [ ] Open ^pocket-ai-3"));
	const second = renderActionItems(items, settings, collectTicks(first));
	assert.equal(second, first);
	assert.ok(collectTicks(first).has("pocket-ai-1"));
});

test("an action-item id with characters outside [A-Za-z0-9-] produces a valid, stable block id", () => {
	const id = blockId("ai:0002/x");
	assert.match(id, /^pocket-[A-Za-z0-9-]+$/);
	assert.equal(id, blockId("ai:0002/x"));
	assert.notEqual(id, blockId("ai-0002-x"));
	assert.equal(blockId("ai-0002-x"), "pocket-ai-0002-x");
});

test("due dates and status render when enabled", () => {
	const items = [item("a", "Call", false, { dueDate: "2026-11-14T00:00:00Z", status: "open" })];
	assert.equal(renderActionItems(items, settingsWith({ actionItemStatus: true }), new Set()), "- [ ] Call (due 2026-11-14) — open ^pocket-a");
	assert.equal(renderActionItems(items, settingsWith({ actionItemDueDates: false }), new Set()), "- [ ] Call ^pocket-a");
});
