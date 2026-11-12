import assert from "node:assert/strict";
import { test } from "node:test";

import { fillTemplate, tokensOf } from "../src/paths/template";
import { localDate } from "../src/paths/time";

const input = { id: "abcdef123456", title: "Kickoff", at: "2026-11-10T23:30:00.000Z", zone: "UTC" };

test("every token fills", () => {
	assert.equal(
		fillTemplate("{{date}}|{{time}}|{{title}}|{{id}}|{{short_id}}|{{year}}|{{month}}|{{day}}|{{hour}}|{{minute}}", input),
		"2026-11-10|23-30|Kickoff|abcdef123456|abcdef|2026|11|10|23|30",
	);
});

test("unknown tokens are left as written and are listed", () => {
	assert.equal(fillTemplate("{{date}} {{nope}}", input), "2026-11-10 {{nope}}");
	assert.deepEqual(tokensOf("{{date}} {{ nope }}"), ["date", "nope"]);
});

test("23:30 UTC is the next day in Auckland and the same day in Chicago", () => {
	assert.equal(localDate(input.at, "Pacific/Auckland"), "2026-11-11");
	assert.equal(localDate(input.at, "America/Chicago"), "2026-11-10");
	assert.equal(fillTemplate("{{date}}", { ...input, zone: "Pacific/Auckland" }), "2026-11-11");
});
