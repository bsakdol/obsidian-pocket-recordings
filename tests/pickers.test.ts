import assert from "node:assert/strict";
import { test } from "node:test";

import { folderChoices, folderLabel, tagChoices, tagLabel } from "../src/settings/pickers";
import { UNFILED_ID } from "../src/settings/schema";
import { folderTree } from "./support/fixtures";

test("folder choices list every folder by path, plus Unfiled, minus those already picked", () => {
	const tree = folderTree();
	const all = folderChoices(tree, new Set());
	assert.deepEqual(all.map((item) => item.label), ["Personal", "Personal/Health", "Unfiled", "Work", "Work/Clients", "Work/Clients/Acme: Q4"]);
	const rest = folderChoices(tree, new Set(["fd-acme-0003", UNFILED_ID]));
	assert.ok(!rest.some((item) => item.id === "fd-acme-0003" || item.id === UNFILED_ID));
	assert.equal(rest.length, 4);
});

test("picked folders and tags show by name, and say so when Pocket no longer has them", () => {
	const tree = folderTree();
	assert.equal(folderLabel("fd-acme-0003", tree), "Work/Clients/Acme: Q4");
	assert.equal(folderLabel(UNFILED_ID, null), "Unfiled");
	assert.match(folderLabel("fd-gone-1234", tree), /not found in Pocket/);
	const tags = [{ id: "t1", name: "highlights" }, { id: "t2", name: "internal" }];
	assert.equal(tagLabel("t2", tags), "internal");
	assert.match(tagLabel("t9", null), /not found in Pocket/);
	assert.deepEqual(tagChoices(tags, new Set(["t1"])).map((item) => item.label), ["internal"]);
});
