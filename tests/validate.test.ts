import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBaseFolder, validateDate, validateInterval, validateTemplate, validateTimeZone } from "../src/settings/validate";

test("the interval accepts 5, 15, 60, and 1440", () => {
	for (const value of [5, 15, 60, 1440]) assert.equal(validateInterval(value), undefined, String(value));
});

test("the interval rejects 2, 0, 1441, and non-integers with a message naming 5–1440", () => {
	for (const value of [2, 0, 1441, 15.5, Number.NaN]) {
		const message = validateInterval(value);
		assert.ok(message?.includes("5–1440"), `${value}: ${message}`);
	}
});

test("templates reject unknown tokens and an empty template", () => {
	assert.equal(validateTemplate("{{date}} {{title}}"), undefined);
	assert.match(validateTemplate("{{date}} {{nope}}") ?? "", /Unknown token \{\{nope\}\}/);
	assert.match(validateTemplate("   ") ?? "", /Enter a name template/);
});

test("the time zone accepts America/Chicago and rejects Mars/Base", () => {
	assert.equal(validateTimeZone("America/Chicago"), undefined);
	assert.ok(validateTimeZone("Mars/Base"));
});

test("dates and base folders validate", () => {
	assert.equal(validateDate("2026-02-28"), undefined);
	assert.ok(validateDate("2026-02-30"));
	assert.ok(validateDate("11/10/2026"));
	assert.equal(validateBaseFolder("Notes/Pocket"), undefined);
	assert.ok(validateBaseFolder(" / "));
});
