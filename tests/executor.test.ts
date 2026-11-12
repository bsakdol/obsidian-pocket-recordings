import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListedRecording } from "../src/model";
import { BEGIN_MARKER, END_MARKER } from "../src/render/markers";
import { execute } from "../src/sync/executor";
import { ids, listedFixture } from "./support/fixtures";
import { assertConverged, detailFor as detailOf, planOnly, syncCycle } from "./support/harness";
import { MemoryVaultOps } from "./support/memoryVaultOps";

const ACME = "Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff";
const ACME_MAIN = `${ACME}/Acme kickoff.md`;
const ACME_TRANSCRIPT = `${ACME}/Acme kickoff - Transcript.md`;
const acme = (overrides: Partial<ListedRecording> = {}): ListedRecording => ({ ...listedFixture(ids.acme), ...overrides });
const changed = () => [acme({ updatedAt: "2026-11-11T09:00:00.000Z" })];

async function synced(): Promise<MemoryVaultOps> {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [acme()]);
	return vault;
}

test("damaged markers: content unchanged, a conflict reported, and no property write", async () => {
	const vault = await synced();
	const damaged = (vault.files.get(ACME_MAIN) ?? "").replace(END_MARKER, "");
	vault.put(ACME_MAIN, damaged);
	const { report } = await syncCycle(vault, changed());
	assert.equal(vault.files.get(ACME_MAIN), damaged);
	assert.deepEqual(report.conflicts.map((c) => c.path), [ACME_MAIN]);
	assert.ok(!vault.writes.some((w) => w.op === "frontmatter" && w.path === ACME_MAIN));
	assert.ok(vault.writes.some((w) => w.path === ACME_TRANSCRIPT), "the recording's healthy note still updates");
});

test("a crash after a rename but before its property write converges with no extra moves", async () => {
	const vault = await synced();
	const moved = [acme({ folderId: "fd-health-0005" })];
	const target = "Pocket/Conversations/Personal/Health/2026-11-10/2026-11-10 Acme kickoff/Acme kickoff.md";
	vault.failNext = { op: "process", path: target };
	const first = await syncCycle(vault, moved);
	assert.equal(first.report.errors.length, 1);
	assert.ok(vault.fileExists(target), "the rename happened");
	assert.notEqual(vault.frontmatterOf(target).pocket_placed_path, target, "but its placement memory did not");

	const second = await syncCycle(vault, moved);
	assert.ok(!second.plan.ops.some((op) => op.kind === "move" && op.to === target), "the moved file is not moved again");
	assert.equal(vault.frontmatterOf(target).pocket_placed_path, target);
	assertConverged(vault, moved);
});

test("a crash after the region write but before the property write re-renders identically next run", async () => {
	const vault = await synced();
	vault.failNext = { op: "frontmatter", path: ACME_MAIN };
	await syncCycle(vault, changed());
	const afterCrash = vault.files.get(ACME_MAIN);
	const { plan } = planOnly(vault, changed());
	assert.ok(plan.ops.some((op) => op.kind === "update-props" && op.path === ACME_MAIN), "the stale updated_at is redone");
	vault.writes.length = 0;
	await syncCycle(vault, changed());
	assert.ok(!vault.writes.some((w) => w.op === "process" && w.path === ACME_MAIN), "the region renders identically and is not rewritten");
	assert.notEqual(vault.files.get(ACME_MAIN), afterCrash);
	assertConverged(vault, changed());
});

test("a create onto a path that exists in a different case becomes a conflict, not a file", async () => {
	const vault = new MemoryVaultOps();
	const { plan } = planOnly(vault, [acme()]);
	vault.put(`${ACME}/ACME KICKOFF.md`, "user note");
	const report = await execute(plan, vault);
	assert.deepEqual(report.conflicts.map((c) => c.path), [ACME_MAIN]);
	assert.equal(vault.files.get(`${ACME}/ACME KICKOFF.md`), "user note");
	assert.ok(!vault.files.has(ACME_MAIN));
});

test("user text outside the region survives an update byte for byte", async () => {
	const vault = await synced();
	const original = vault.files.get(ACME_MAIN) ?? "";
	const withNotes = original.replace(BEGIN_MARKER, `My intro\n\n${BEGIN_MARKER}`).replace(`${END_MARKER}\n`, `${END_MARKER}\n\n## My notes\n- keep me  \n`);
	vault.put(ACME_MAIN, withNotes);
	await syncCycle(vault, changed(), { detail: (listed) => ({ ...detailOf(listed), summary: { title: "x", emoji: null, markdown: "Regenerated summary" } }) });
	const updated = vault.files.get(ACME_MAIN) ?? "";
	assert.ok(updated.includes("Regenerated summary"));
	assert.ok(updated.includes(`My intro\n\n${BEGIN_MARKER}`));
	assert.ok(updated.endsWith(`${END_MARKER}\n\n## My notes\n- keep me  \n`));
});

test("an unchanged property set issues no processFrontMatter call", async () => {
	const vault = await synced();
	vault.writes.length = 0;
	await syncCycle(vault, [acme()], { resyncAll: true });
	assert.deepEqual(vault.writes, []);
});

test("a move removes an emptied recording folder but keeps one holding a user file", async () => {
	const kept = await synced();
	kept.put(`${ACME}/my scribbles.md`, "mine");
	await syncCycle(kept, [acme({ folderId: "fd-health-0005" })]);
	assert.ok(kept.folderExists(ACME));
	assert.equal(kept.files.get(`${ACME}/my scribbles.md`), "mine");

	const removed = await synced();
	await syncCycle(removed, [acme({ folderId: "fd-health-0005" })]);
	assert.ok(!removed.folderExists(ACME));
	assert.ok(!removed.folderExists("Pocket/Conversations/Work"), "the emptied chain is removed up to the base");
	assert.ok(removed.folderExists("Pocket"));
});

test("one failed op skips only that recording's remaining ops", async () => {
	const vault = new MemoryVaultOps();
	const memo = listedFixture(ids.memo);
	vault.failNext = { op: "create", path: ACME_MAIN };
	const { report } = await syncCycle(vault, [acme(), memo]);
	assert.equal(report.errors.length, 1);
	assert.ok(!vault.files.has(ACME_TRANSCRIPT));
	assert.ok(vault.paths().some((path) => path.includes("Voice memo")));
	await syncCycle(vault, [acme(), memo]);
	assertConverged(vault, [acme(), memo]);
});
