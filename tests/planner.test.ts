import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListedRecording } from "../src/model";
import { ids, listedFixture } from "./support/fixtures";
import { assertConverged, detailFor, NOW, opSummary, planOnly, syncCycle } from "./support/harness";
import { MemoryVaultOps } from "./support/memoryVaultOps";
import { settingsWith } from "./support/settings";

const ACME = "Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff";
const ACME_MAIN = `${ACME}/Acme kickoff.md`;
const ACME_TRANSCRIPT = `${ACME}/Acme kickoff - Transcript.md`;
const acme = (overrides: Partial<ListedRecording> = {}): ListedRecording => ({ ...listedFixture(ids.acme), ...overrides });

async function synced(listing: ListedRecording[] = [acme()], settings = settingsWith()): Promise<MemoryVaultOps> {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, listing, { settings });
	return vault;
}

test("a new in-scope recording creates a note per role plus its folder", () => {
	const { plan, fetched } = planOnly(new MemoryVaultOps(), [acme()]);
	assert.deepEqual(fetched, [ids.acme]);
	assert.deepEqual(opSummary(plan), [`ensure-folder ${ACME}`, `create ${ACME_MAIN}`, `create ${ACME_TRANSCRIPT}`]);
});

test("an unchanged recording produces no ops and no detail fetch", async () => {
	const vault = await synced();
	const { plan, fetched } = planOnly(vault, [acme()]);
	assert.deepEqual(plan.ops, []);
	assert.deepEqual(fetched, []);
	assert.deepEqual(plan.unchanged, [`id:${ids.acme}`]);
});

test("a changed updated_at fetches details and updates region and properties", async () => {
	const vault = await synced();
	const listing = [acme({ updatedAt: "2026-11-11T09:00:00.000Z" })];
	const { plan, fetched } = planOnly(vault, listing);
	assert.deepEqual(fetched, [ids.acme]);
	assert.deepEqual(opSummary(plan), [`update-region ${ACME_MAIN}`, `update-props ${ACME_MAIN}`, `update-region ${ACME_TRANSCRIPT}`, `update-props ${ACME_TRANSCRIPT}`]);
	await syncCycle(vault, listing);
	assertConverged(vault, listing);
});

test("a render fingerprint mismatch fetches details and updates", async () => {
	const vault = await synced();
	const settings = settingsWith({ transcriptTimestamps: false });
	const { plan, fetched } = planOnly(vault, [acme()], { settings });
	assert.deepEqual(fetched, [ids.acme]);
	assert.ok(opSummary(plan).includes(`update-region ${ACME_TRANSCRIPT}`));
	await syncCycle(vault, [acme()], { settings });
	assert.ok(!vault.files.get(ACME_TRANSCRIPT)?.includes("[0:00]"));
	assertConverged(vault, [acme()], { settings });
});

test("a Pocket folder move moves files still at their placed path", async () => {
	const vault = await synced();
	const moved = [acme({ folderId: "fd-health-0005" })];
	const { plan } = planOnly(vault, moved);
	const target = "Pocket/Conversations/Personal/Health/2026-11-10/2026-11-10 Acme kickoff";
	assert.ok(opSummary(plan).includes(`move ${ACME_MAIN} -> ${target}/Acme kickoff.md`));
	await syncCycle(vault, moved);
	assert.ok(vault.fileExists(`${target}/Acme kickoff.md`));
	assert.ok(!vault.folderExists(ACME), "the emptied recording folder is removed");
	assert.ok(vault.folderExists("Pocket/Conversations"), "nothing above the empty chain is removed");
	assertConverged(vault, moved);
});

test("a user move followed by a Pocket move updates content in place and reports user-moved", async () => {
	const vault = await synced();
	for (const path of [ACME_MAIN, ACME_TRANSCRIPT]) {
		const name = path.split("/").pop() ?? "";
		await vault.ensureFolder("Projects/Acme");
		await vault.rename(path, `Projects/Acme/${name}`);
	}
	const moved = [acme({ folderId: "fd-health-0005", updatedAt: "2026-11-11T09:00:00.000Z" })];
	const { plan } = planOnly(vault, moved);
	assert.ok(!plan.ops.some((op) => op.kind === "move"));
	assert.ok(opSummary(plan).includes("update-region Projects/Acme/Acme kickoff.md"));
	const { report } = await syncCycle(vault, moved);
	assert.deepEqual(report.userMoved.sort(), ["Projects/Acme/Acme kickoff - Transcript.md", "Projects/Acme/Acme kickoff.md"]);
	assert.equal(report.relocated.length, 0);
	assertConverged(vault, moved);
});

test("a file already at its new target with a stale placed path only gets its property repaired", async () => {
	const vault = await synced();
	await vault.processFrontmatter(ACME_MAIN, (fm) => {
		fm.pocket_placed_path = "Somewhere/old.md";
	});
	const { plan, fetched } = planOnly(vault, [acme()]);
	assert.deepEqual(fetched, []);
	assert.deepEqual(opSummary(plan), [`update-props ${ACME_MAIN}`]);
	const op = plan.ops[0];
	assert.deepEqual(op?.kind === "update-props" ? op.set : null, { pocket_placed_path: ACME_MAIN });
});

test("a missing transcript is recreated alone", async () => {
	const vault = await synced();
	vault.delete(ACME_TRANSCRIPT);
	const { plan } = planOnly(vault, [acme()]);
	assert.ok(opSummary(plan).includes(`create ${ACME_TRANSCRIPT}`));
	assert.ok(!plan.ops.some((op) => op.kind === "create" && op.path === ACME_MAIN));
	await syncCycle(vault, [acme()]);
	assertConverged(vault, [acme()]);
});

test("a recording folder deleted from the vault is fully re-created", async () => {
	const vault = await synced();
	vault.deleteFolder(ACME);
	const { report } = await syncCycle(vault, [acme()]);
	assert.deepEqual(report.created.sort(), [ACME_TRANSCRIPT, ACME_MAIN].sort());
	assertConverged(vault, [acme()]);
});

test("an unlisted recording inside the horizon is marked deleted and stops updating", async () => {
	const vault = await synced();
	const { plan, report } = await syncCycle(vault, []);
	assert.deepEqual(opSummary(plan), [`mark deleted ${ACME_MAIN}`, `mark deleted ${ACME_TRANSCRIPT}`]);
	assert.deepEqual(report.deleted.sort(), [ACME_TRANSCRIPT, ACME_MAIN].sort());
	assert.ok(vault.files.has(ACME_MAIN), "nothing is moved or deleted");
	assertConverged(vault, []);
	// Listed again, it is unmarked and resumes updating.
	await syncCycle(vault, [acme()]);
	assert.equal(vault.frontmatterOf(ACME_MAIN).pocket_status, undefined);
	assertConverged(vault, [acme()]);
});

test("a recording that aged out of a rolling horizon is left exactly as it is", async () => {
	const vault = await synced();
	const before = new Map(vault.files);
	const settings = settingsWith({ horizon: "days", horizonDays: 30 });
	const later = NOW + 31 * 24 * 60 * 60 * 1000;
	const { plan } = planOnly(vault, [], { settings, now: later });
	assert.deepEqual(plan.ops, []);
	await syncCycle(vault, [], { settings, now: later });
	assert.deepEqual(vault.files, before);
});

test("an excluded recording is marked excluded; re-included, the mark is cleared", async () => {
	const vault = await synced();
	const excluded = settingsWith({ excludeTagIds: ["tg-internal-02"] });
	const { report } = await syncCycle(vault, [acme()], { settings: excluded });
	assert.equal(report.excluded.length, 2);
	assert.equal(vault.frontmatterOf(ACME_MAIN).pocket_status, "excluded");
	assertConverged(vault, [acme()], { settings: excluded });
	const { plan, fetched } = planOnly(vault, [acme()]);
	assert.deepEqual(fetched, []);
	assert.deepEqual(opSummary(plan), [`clear-mark ${ACME_MAIN}`, `clear-mark ${ACME_TRANSCRIPT}`]);
	await syncCycle(vault, [acme()]);
	assertConverged(vault, [acme()]);
});

test("a frozen note gets no ops, only a report", async () => {
	const vault = await synced();
	await vault.processFrontmatter(ACME_MAIN, (fm) => {
		fm.pocket_freeze = true;
	});
	const before = vault.files.get(ACME_MAIN);
	const listing = [acme({ updatedAt: "2026-11-11T09:00:00.000Z", folderId: "fd-health-0005" })];
	const { plan, report } = await syncCycle(vault, listing);
	assert.ok(!plan.ops.some((op) => ("path" in op ? op.path : op.from) === ACME_MAIN));
	assert.equal(vault.files.get(ACME_MAIN), before);
	assert.deepEqual(report.frozen, [ACME_MAIN]);
});

test("two notes claiming one recording-role freeze the recording and are reported", async () => {
	const vault = await synced();
	vault.put(`${ACME}/Acme kickoff copy.md`, vault.files.get(ACME_MAIN) ?? "");
	const { plan, report } = await syncCycle(vault, [acme({ updatedAt: "2026-11-11T09:00:00.000Z" })]);
	assert.deepEqual(plan.ops, []);
	assert.equal(report.duplicates.length, 1);
	assert.equal(report.duplicates[0]?.length, 3);
});

test("a kind flip creates the insight note and supersedes the conversation notes", async () => {
	const vault = await synced();
	const flipped = [acme({ tags: [{ id: "tg-highlights-01", name: "highlights" }] })];
	const { report } = await syncCycle(vault, flipped);
	assert.deepEqual(report.created, ["Pocket/Insights/2026-11-10/2026-11-10 Acme kickoff.md"]);
	assert.deepEqual(report.superseded.sort(), [ACME_TRANSCRIPT, ACME_MAIN].sort());
	assertConverged(vault, flipped);
});

test("main+transcript to per-output creates the new files, supersedes main, and reuses the transcript", async () => {
	const vault = await synced();
	const perOutput = settingsWith({ layout: "per-output" });
	const { report } = await syncCycle(vault, [acme()], { settings: perOutput });
	assert.deepEqual(report.created.sort(), [
		`${ACME}/Acme kickoff - Action items.md`,
		`${ACME}/Acme kickoff - Mind map.md`,
		`${ACME}/Acme kickoff - Summary.md`,
		`${ACME}/Acme kickoff - Translation.md`,
	]);
	assert.deepEqual(report.superseded, [ACME_MAIN]);
	assert.ok(vault.files.has(ACME_MAIN), "the old main note stays in place");
	assertConverged(vault, [acme()], { settings: perOutput });

	const { report: back } = await syncCycle(vault, [acme()]);
	assert.equal(vault.frontmatterOf(ACME_MAIN).pocket_status, undefined, "switching back reclaims the superseded main note");
	assert.equal(back.created.length, 0);
	assert.equal(back.superseded.length, 4);
	assertConverged(vault, [acme()]);
});

test("colliding recordings get the same suffixes whatever the listing order", async () => {
	const twin = (id: string, at: string): ListedRecording => ({ ...acme(), id, recordingAt: at, updatedAt: at });
	const a = twin("aaaaaa-1", "2026-11-10T09:00:00.000Z");
	const b = twin("bbbbbb-2", "2026-11-10T10:00:00.000Z");
	const one = new MemoryVaultOps();
	const two = new MemoryVaultOps();
	await syncCycle(one, [a, b]);
	await syncCycle(two, [b, a]);
	assert.deepEqual(one.paths(), two.paths());
	assert.ok(one.paths().some((path) => path.includes("Acme kickoff (bbbbbb)/")));
	assertConverged(one, [b, a]);
});

test("a later recording at the plain path moves aside for an earlier one listed afterwards", async () => {
	const twin = (id: string, at: string): ListedRecording => ({ ...acme(), id, recordingAt: at, updatedAt: at });
	const later = twin("bbbbbb-2", "2026-11-10T10:00:00.000Z");
	const earlier = twin("aaaaaa-1", "2026-11-10T09:00:00.000Z");
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [later]);
	const { report } = await syncCycle(vault, [later, earlier]);
	assert.equal(report.conflicts.length, 0);
	assert.ok(vault.frontmatterOf(ACME_MAIN).pocket_id === "aaaaaa-1");
	assertConverged(vault, [later, earlier]);
});

test("a held recording and an out-of-horizon one produce nothing", () => {
	const { plan } = planOnly(new MemoryVaultOps(), [listedFixture(ids.processing)]);
	assert.deepEqual(plan.ops, []);
});

test("a detail that disagrees with the listing still converges instead of refetching every sync", async () => {
	const vault = new MemoryVaultOps();
	const listing = [acme()];
	const disagreeing = { detail: (listed: ListedRecording) => ({ ...detailFor(listed), language: "fr", title: "Other title", durationSeconds: 5 }) };
	await syncCycle(vault, listing, disagreeing);
	assert.equal(vault.frontmatterOf(ACME_MAIN).pocket_language, "en");
	assertConverged(vault, listing, disagreeing);
});

test("a renamed recording moves its plugin-placed notes to the new name", async () => {
	const vault = await synced();
	const renamed = [acme({ title: "Acme 1:1", updatedAt: "2026-11-11T09:00:00.000Z" })];
	const { report } = await syncCycle(vault, renamed);
	const folder = "Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme 1-1";
	assert.deepEqual(report.relocated.sort(), [`${folder}/Acme 1-1 - Transcript.md`, `${folder}/Acme 1-1.md`]);
	assert.ok(!vault.folderExists(ACME), "the old recording folder is removed once empty");
	assertConverged(vault, renamed);
});
