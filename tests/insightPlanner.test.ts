import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListedRecording } from "../src/model";
import { ids, listedFixture } from "./support/fixtures";
import { assertConverged, opSummary, planOnly, syncCycle } from "./support/harness";
import { MemoryVaultOps } from "./support/memoryVaultOps";
import { settingsWith } from "./support/settings";

const ROLLUP = "Pocket/Insights/2026-11-10/2026-11-10 Highlights.md";
const rollup = settingsWith({ insightShape: "rollup" });
const idea = (overrides: Partial<ListedRecording> = {}): ListedRecording => ({ ...listedFixture(ids.idea), ...overrides });
const second = (overrides: Partial<ListedRecording> = {}): ListedRecording => ({
	...listedFixture(ids.idea),
	id: "hl-second-0001",
	title: "Second thought",
	recordingAt: "2026-11-10T09:30:00.000Z",
	updatedAt: "2026-11-10T09:35:00.000Z",
	...overrides,
});

test("two highlights on one day make one rollup with both", async () => {
	const vault = new MemoryVaultOps();
	const { report } = await syncCycle(vault, [idea(), second()], { settings: rollup });
	assert.deepEqual(report.created, [ROLLUP]);
	const content = vault.files.get(ROLLUP) ?? "";
	assert.ok(content.indexOf("09:30 · Second thought") < content.indexOf("18:00 · Big idea"));
	assert.deepEqual(vault.frontmatterOf(ROLLUP).pocket_members, [`${ids.idea}@2026-11-10T18:05:00.000Z`, "hl-second-0001@2026-11-10T09:35:00.000Z"]);
	assertConverged(vault, [idea(), second()], { settings: rollup });
});

test("a member deleted in Pocket regenerates the rollup with the rest, and the last marks it deleted", async () => {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [idea(), second()], { settings: rollup });
	await syncCycle(vault, [idea()], { settings: rollup });
	const content = vault.files.get(ROLLUP) ?? "";
	assert.ok(content.includes("Big idea"));
	assert.ok(!content.includes("Second thought"));
	assertConverged(vault, [idea()], { settings: rollup });

	const { report } = await syncCycle(vault, [], { settings: rollup });
	assert.deepEqual(report.deleted, [ROLLUP]);
	assert.ok(vault.files.has(ROLLUP));
	assertConverged(vault, [], { settings: rollup });
});

test("a changed member regenerates its rollup; an unchanged member set produces no ops", async () => {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [idea(), second()], { settings: rollup });
	const { plan, fetched } = planOnly(vault, [idea(), second({ updatedAt: "2026-11-11T08:00:00.000Z" })], { settings: rollup });
	assert.deepEqual(fetched.sort(), [ids.idea, "hl-second-0001"].sort(), "a rollup regenerates from every member");
	assert.deepEqual(opSummary(plan), [`update-region ${ROLLUP}`, `update-props ${ROLLUP}`]);
	assert.deepEqual(planOnly(vault, [idea(), second()], { settings: rollup }).plan.ops, []);
});

test("switching from per-recording to rollup creates rollups and supersedes the per-recording notes", async () => {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [idea(), second()]);
	const perRecording = vault.paths();
	assert.equal(perRecording.length, 2);
	const { report } = await syncCycle(vault, [idea(), second()], { settings: rollup });
	assert.deepEqual(report.created, [ROLLUP]);
	assert.deepEqual(report.superseded.sort(), perRecording);
	assertConverged(vault, [idea(), second()], { settings: rollup });

	const { report: back } = await syncCycle(vault, [idea(), second()]);
	assert.deepEqual(back.superseded, [ROLLUP]);
	assertConverged(vault, [idea(), second()]);
});

test("a rollup's action-item ticks survive regeneration", async () => {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [idea(), second()], { settings: rollup });
	vault.put(ROLLUP, (vault.files.get(ROLLUP) ?? "").replace("- [ ] Sketch the design", "- [x] Sketch the design"));
	await syncCycle(vault, [idea({ updatedAt: "2026-11-11T08:00:00.000Z" }), second()], { settings: rollup });
	assert.ok((vault.files.get(ROLLUP) ?? "").includes("- [x] Sketch the design ^pocket-ai-0004"));
});

test("rollup dates before the horizon are left alone", async () => {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [idea()], { settings: rollup });
	const later = Date.parse("2026-12-20T12:00:00Z");
	const { plan } = planOnly(vault, [], { settings: settingsWith({ insightShape: "rollup", horizon: "days", horizonDays: 30 }), now: later });
	assert.deepEqual(plan.ops, []);
});

test("a per-recording insight note syncs and repeats as a no-op", async () => {
	const vault = new MemoryVaultOps();
	const { report } = await syncCycle(vault, [idea()]);
	assert.deepEqual(report.created, ["Pocket/Insights/2026-11-10/2026-11-10 Big idea.md"]);
	assert.ok((vault.files.get(report.created[0] ?? "") ?? "").includes("## Summary"));
	assertConverged(vault, [idea()]);
});
