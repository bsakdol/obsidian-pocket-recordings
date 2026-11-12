import assert from "node:assert/strict";
import { test } from "node:test";

import { ShapeError } from "../src/pocket/errors";
import { FolderTree } from "../src/pocket/folders";
import { folderTree } from "./support/fixtures";

test("a nested folder resolves to Space/Parent/Child", () => {
	assert.equal(folderTree().displayPath("fd-acme-0003"), "Work/Clients/Acme: Q4");
});

test("a folder_id pointing at a space resolves to the space", () => {
	assert.equal(folderTree().displayPath("sp-work-0001"), "Work");
});

test("no folder_id is Unfiled", () => {
	assert.equal(folderTree().displayPath(null), "Unfiled");
	assert.deepEqual(folderTree().placement(null), { segments: [], known: true });
});

test("an unknown folder id is reported as unknown", () => {
	assert.equal(folderTree().placement("fd-missing").known, false);
});

test("descendants are within their ancestors", () => {
	const tree = folderTree();
	assert.equal(tree.isWithin("fd-acme-0003", "fd-clients-0002"), true);
	assert.equal(tree.isWithin("fd-acme-0003", "sp-work-0001"), true);
	assert.equal(tree.isWithin("fd-health-0005", "sp-work-0001"), false);
});

test("a flat tree linked by parent_folder_id and space_id resolves the same", () => {
	const tree = FolderTree.fromRaw([
		{ id: "s", name: "Space", kind: "space", space_id: "s" },
		{ id: "p", name: "Parent", kind: "folder", space_id: "s", parent_folder_id: null },
		{ id: "c", name: "Child", kind: "folder", space_id: "s", parent_folder_id: "p" },
	]);
	assert.equal(tree.displayPath("c"), "Space/Parent/Child");
});

test("a tree round-trips through its cached form", () => {
	const tree = folderTree();
	assert.equal(FolderTree.fromNodes(tree.toJSON()).displayPath("fd-acme-0003"), "Work/Clients/Acme: Q4");
});

test("a folder response that is not a list is a ShapeError, never an empty tree", () => {
	assert.throws(() => FolderTree.fromRaw(null), ShapeError);
});
