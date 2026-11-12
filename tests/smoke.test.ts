import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizePath } from "obsidian";

test("the test runner bundles tests with the obsidian stub", () => {
	assert.equal(normalizePath("a//b/"), "a/b");
});
