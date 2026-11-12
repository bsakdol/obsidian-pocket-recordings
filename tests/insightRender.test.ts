import assert from "node:assert/strict";
import { test } from "node:test";

import { renderInsight, renderRollup } from "../src/render/insight";
import { detailFixture, ids } from "./support/fixtures";
import { settingsWith } from "./support/settings";

test("a rollup has one timed section per member, in recording order", () => {
	const idea = detailFixture(ids.idea);
	const early = { ...detailFixture(ids.doctor), recordingAt: "2026-11-10T07:05:00.000Z" };
	const body = renderRollup([idea, early], settingsWith(), new Set());
	assert.ok(body.startsWith("## 07:05 · Doctor visit\n\nResults look normal."), "a member without a summary falls back to its transcript");
	assert.ok(body.includes("## 18:00 · Big idea\n\nAn idea about self-syncing notes.\n\n- [ ] Sketch the design ^pocket-ai-0004"));
});

test("rollup times use the vault zone", () => {
	const body = renderRollup([detailFixture(ids.idea)], settingsWith({ timeZone: "Pacific/Auckland" }), new Set());
	assert.ok(body.startsWith("## 07:00 · Big idea"));
});

test("a per-recording insight renders its sections deterministically", () => {
	const detail = detailFixture(ids.idea);
	const body = renderInsight(detail, settingsWith(), new Set());
	assert.ok(body.includes("## Summary") && body.includes("## Transcript"));
	assert.equal(body, renderInsight(detail, settingsWith(), new Set()));
});
