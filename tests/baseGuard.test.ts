import assert from "node:assert/strict";
import { test } from "node:test";

import { checkBaseFolder } from "../src/sync/baseGuard";

const plugin = (path: string) => ({ path, frontmatter: { pocket_id: "r", pocket_role: "main" } });
const foreign = (path: string) => ({ path, frontmatter: {} });

test("an empty or missing base folder passes", () => {
	assert.equal(checkBaseFolder([], "Pocket").ok, true);
	assert.equal(checkBaseFolder([foreign("Elsewhere/a.md")], "Pocket").ok, true);
});

test("a folder holding only plugin notes passes", () => {
	assert.equal(checkBaseFolder([plugin("Pocket/a.md"), plugin("Pocket/b/c.md")], "Pocket").ok, true);
});

test("a folder with foreign notes and no plugin notes blocks", () => {
	const result = checkBaseFolder([foreign("Pocket/Old tool/a.md"), foreign("pocket/b.md")], "Pocket");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.foreignNotes, 2);
		assert.match(result.message, /another base folder/);
	}
});

test("plugin notes plus a user-added note pass", () => {
	assert.equal(checkBaseFolder([plugin("Pocket/a.md"), foreign("Pocket/my notes.md")], "Pocket").ok, true);
});

test("a sibling folder that merely shares a prefix is not inside the base", () => {
	assert.equal(checkBaseFolder([foreign("Pocketbook/a.md")], "Pocket").ok, true);
});
