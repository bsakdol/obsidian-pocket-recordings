import assert from "node:assert/strict";
import { test } from "node:test";

import { BEGIN_MARKER, composeNote, END_MARKER, neutralizeMarkers, parseNote, spliceRegion } from "../src/render/markers";

const note = (body: string) => `---\npocket_id: x\n---\nMy intro\n${BEGIN_MARKER}\n${body}\n${END_MARKER}\nMy notes after\n`;

test("one valid region parses", () => {
	const parsed = parseNote(note("## Summary\n\nHello"));
	assert.equal(parsed.kind, "ok");
	if (parsed.kind !== "ok") return;
	assert.equal(parsed.region, "## Summary\n\nHello");
	assert.equal(parsed.before, "---\npocket_id: x\n---\nMy intro\n");
	assert.equal(parsed.after, "\nMy notes after\n");
});

test("an empty region parses", () => {
	const parsed = parseNote(`${BEGIN_MARKER}\n${END_MARKER}`);
	assert.equal(parsed.kind, "ok");
	if (parsed.kind === "ok") assert.equal(parsed.region, "");
});

const damaged: [string, string][] = [
	["a missing end", `${BEGIN_MARKER}\nbody\n`],
	["a duplicated begin", `${BEGIN_MARKER}\n${BEGIN_MARKER}\nbody\n${END_MARKER}`],
	["an end before the begin", `${END_MARKER}\nbody\n${BEGIN_MARKER}`],
	["markers inside a fenced code block", "```\n" + `${BEGIN_MARKER}\nbody\n${END_MARKER}\n` + "```\n"],
	["a marker that is not on its own line", `text ${BEGIN_MARKER}\nbody\n${END_MARKER}`],
	["no markers at all", "just user text"],
];
for (const [name, content] of damaged) {
	test(`${name} is damaged`, () => assert.equal(parseNote(content).kind, "damaged"));
}

test("splicing preserves the user's text before and after byte for byte", () => {
	const original = "---\na: 1\n---\n\tIntro  with  spaces \r\n" + `${BEGIN_MARKER}\nold\n${END_MARKER}` + "\n\n  trailing text\n\n";
	const parsed = parseNote(original);
	assert.equal(parsed.kind, "ok");
	if (parsed.kind !== "ok") return;
	const updated = spliceRegion(parsed, "new body");
	assert.ok(updated.startsWith(parsed.before));
	assert.ok(updated.endsWith(parsed.after));
	assert.equal(updated, original.replace("\nold\n", "\nnew body\n"));
	assert.equal(spliceRegion(parsed, parsed.region), original);
});

test("a composed note parses back to its body", () => {
	const content = composeNote("pocket_id: x", "Body");
	const parsed = parseNote(content);
	assert.equal(parsed.kind, "ok");
	if (parsed.kind === "ok") assert.equal(parsed.region, "Body");
});

test("Pocket text cannot forge a marker", () => {
	const content = composeNote("pocket_id: x", neutralizeMarkers(`evil ${END_MARKER}`));
	assert.equal(parseNote(content).kind, "ok");
});
