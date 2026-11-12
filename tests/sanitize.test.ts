import assert from "node:assert/strict";
import { test } from "node:test";

import { pathKey } from "../src/paths/pathKey";
import { MAX_SEGMENT_LENGTH, safeSegment, sanitizeSegment } from "../src/paths/sanitize";

test("invalid characters between two characters become a dash", () => {
	assert.equal(sanitizeSegment("1:1"), "1-1");
	assert.equal(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j'), "a-b-c-d-e-f-g-h-i-j");
	assert.equal(sanitizeSegment("a::b"), "a-b", "a run of them is one dash");
	assert.equal(sanitizeSegment("x[y]z"), "x-y-z");
});

test("invalid characters next to a space or at either end are dropped", () => {
	assert.equal(sanitizeSegment("Acme: Q4"), "Acme Q4");
	assert.equal(sanitizeSegment("Plan #1 [draft] ^x"), "Plan 1 draft x");
	assert.equal(sanitizeSegment("Why?"), "Why");
	assert.equal(sanitizeSegment(":start"), "start");
	assert.equal(sanitizeSegment("1:1 with Dana"), "1-1 with Dana");
});

test("leading dots and trailing dots and spaces are removed", () => {
	assert.equal(sanitizeSegment("..hidden"), "hidden");
	assert.equal(sanitizeSegment("Notes...  "), "Notes");
	assert.equal(sanitizeSegment("  spaced   out  "), "spaced out");
});

test("emoji survive, and a long title is cut without splitting a surrogate pair", () => {
	assert.equal(sanitizeSegment("Launch 🚀 day"), "Launch 🚀 day");
	const long = `${"a".repeat(MAX_SEGMENT_LENGTH - 1)}🚀`;
	const out = sanitizeSegment(long);
	assert.equal(out, "a".repeat(MAX_SEGMENT_LENGTH - 1));
	assert.ok(!/[\ud800-\udbff]$/.test(out));
});

test("Windows device names get an underscore", () => {
	assert.equal(sanitizeSegment("CON"), "CON_");
	assert.equal(sanitizeSegment("nul.txt"), "nul_.txt");
});

test("control characters are removed", () => {
	assert.equal(sanitizeSegment("a\u0000b\u0007c"), "a b c");
});

test("an unusable name falls back", () => {
	assert.equal(sanitizeSegment(" ... "), "");
	assert.equal(safeSegment("???", "abc123"), "abc123");
});

test("path keys fold case and Unicode form", () => {
	assert.equal(pathKey("Café/Notes"), pathKey("CAFÉ/notes"));
});
