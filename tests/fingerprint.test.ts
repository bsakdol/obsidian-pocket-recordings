import assert from "node:assert/strict";
import { test } from "node:test";

import { renderFingerprint, structureFingerprint } from "../src/settings/fingerprint";
import { DEFAULT_SETTINGS, type Settings } from "../src/settings/schema";
import { fnv1a, stableStringify } from "../src/util/hash";

const base: Settings = { ...DEFAULT_SETTINGS, sectionOrder: [...DEFAULT_SETTINGS.sectionOrder] };

test("changing a template changes the structure fingerprint but not the render fingerprint", () => {
	const changed = { ...base, templateMain: "{{date}} {{title}}" };
	assert.notEqual(structureFingerprint(changed), structureFingerprint(base));
	assert.equal(renderFingerprint(changed), renderFingerprint(base));
});

test("toggling timestamps changes the render fingerprint but not the structure fingerprint", () => {
	const changed = { ...base, transcriptTimestamps: false };
	assert.notEqual(renderFingerprint(changed), renderFingerprint(base));
	assert.equal(structureFingerprint(changed), structureFingerprint(base));
});

test("equal settings in a different key order produce the same fingerprint", () => {
	const reversed = Object.fromEntries(Object.entries(base).reverse()) as unknown as Settings;
	assert.equal(renderFingerprint(reversed), renderFingerprint(base));
	assert.equal(structureFingerprint(reversed), structureFingerprint(base));
});

test("settings outside both subsets change neither fingerprint", () => {
	const changed = { ...base, intervalMinutes: 15, debugLogging: true, apiKeySecret: "x" };
	assert.equal(renderFingerprint(changed), renderFingerprint(base));
	assert.equal(structureFingerprint(changed), structureFingerprint(base));
});

test("the hash is stable and the stringifier sorts keys", () => {
	assert.equal(fnv1a(""), "811c9dc5");
	assert.equal(fnv1a("a"), "e40c292c");
	assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});
