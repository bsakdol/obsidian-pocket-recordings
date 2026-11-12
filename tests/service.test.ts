import assert from "node:assert/strict";
import { test } from "node:test";

import type { Settings } from "../src/settings/schema";
import { runSync, type SyncDeps } from "../src/sync/service";
import { status } from "./support/fakeTransport";
import { fakePocket, type FakePocketOptions } from "./support/fakePocket";
import { ids } from "./support/fixtures";
import { NOW } from "./support/harness";
import { MemoryVaultOps } from "./support/memoryVaultOps";
import { settingsWith } from "./support/settings";

function deps(vault: MemoryVaultOps, pocket: FakePocketOptions = {}, settings: Settings = settingsWith()): SyncDeps & { calls: URL[] } {
	const { request, calls } = fakePocket(pocket);
	return {
		calls,
		vault,
		request,
		apiKey: () => "pk_test",
		prepareSettings: async () => settings,
		waitForResolved: async () => {},
		now: () => NOW,
		isMobile: false,
		cancelled: () => false,
		sleep: async () => {},
	};
}

const run = (d: SyncDeps, resyncAll = false) => runSync(d, { manual: true, resyncAll });

const EXPECTED = [
	"Pocket/Conversations/Personal/Health/2026-11-07/2026-11-07 Doctor visit/Doctor visit - Transcript.md",
	"Pocket/Conversations/Personal/Health/2026-11-07/2026-11-07 Doctor visit/Doctor visit.md",
	"Pocket/Conversations/Unfiled/2026-11-08/2026-11-08 Voice memo/Voice memo - Transcript.md",
	"Pocket/Conversations/Unfiled/2026-11-08/2026-11-08 Voice memo/Voice memo.md",
	"Pocket/Conversations/Work/2026-11-09/2026-11-09 Weekly sync/Weekly sync - Transcript.md",
	"Pocket/Conversations/Work/2026-11-09/2026-11-09 Weekly sync/Weekly sync.md",
	"Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff/Acme kickoff - Transcript.md",
	"Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff/Acme kickoff.md",
	"Pocket/Insights/2026-11-10/2026-11-10 Big idea.md",
];

test("the service syncs the fixtures end to end into the expected tree, then is a no-op", async () => {
	const vault = new MemoryVaultOps();
	const first = await run(deps(vault));
	assert.equal(first.status, "ok");
	assert.deepEqual(vault.paths(), EXPECTED);
	assert.equal(first.report.created.length, EXPECTED.length);
	assert.ok(!vault.paths().some((path) => path.includes("New recording")), "an unfinished recording is held");
	for (const path of vault.paths()) {
		const keys = Object.keys(vault.frontmatterOf(path));
		assert.ok(keys.length > 0 && keys.every((key) => key.startsWith("pocket_")), `${path} has a property outside pocket_*: ${keys.join(", ")}`);
	}

	vault.writes.length = 0;
	const second = deps(vault);
	const again = await run(second);
	assert.equal(again.status, "ok");
	assert.deepEqual(vault.writes, [], "a second sync writes nothing");
	assert.equal(again.report.unchanged, 5);
	assert.ok(!second.calls.some((url) => /\/public\/recordings\/./.test(url.pathname)), "and fetches no details");
});

test("a listing failure leaves zero writes", async () => {
	const vault = new MemoryVaultOps();
	const outcome = await run(deps(vault, { listingFail: true }));
	assert.equal(outcome.status, "aborted");
	assert.deepEqual(vault.writes, []);
});

test("an unreadable folder tree under the Pocket-folder scheme leaves zero writes", async () => {
	const vault = new MemoryVaultOps();
	const outcome = await run(deps(vault, { foldersFail: true }));
	assert.equal(outcome.status, "aborted");
	assert.match(outcome.message ?? "", /Pocket folders/);
	assert.deepEqual(vault.writes, []);
});

test("an unreadable folder tree with active folder filters leaves zero writes", async () => {
	const vault = new MemoryVaultOps();
	const settings = settingsWith({ scheme: "date", excludeFolderIds: ["fd-health-0005"] });
	assert.equal((await run(deps(vault, { foldersFail: true }, settings))).status, "aborted");
	assert.deepEqual(vault.writes, []);
	const noFilters = await run(deps(vault, { foldersFail: true }, settingsWith({ scheme: "date" })));
	assert.equal(noFilters.status, "ok", "without filters the date scheme does not need the tree");
});

test("a 401 during details aborts the run and reports auth, before any write", async () => {
	const vault = new MemoryVaultOps();
	const outcome = await run(deps(vault, { detailResponse: (id) => (id === ids.memo ? status(401) : undefined) }));
	assert.equal(outcome.status, "auth");
	assert.deepEqual(vault.writes, []);
});

test("one recording's malformed detail is reported, and the others sync", async () => {
	const vault = new MemoryVaultOps();
	const outcome = await run(deps(vault, { detailResponse: (id) => (id === ids.memo ? { status: 200, json: { success: true, data: "garbage" }, headers: {} } : undefined) }));
	assert.equal(outcome.status, "ok");
	assert.equal(outcome.report.errors.length, 1);
	assert.match(outcome.report.errors[0]?.message ?? "", /Voice memo/);
	assert.equal(vault.paths().length, EXPECTED.length - 2);
});

test("an exhausted rate-limit budget writes what it has and reports the run incomplete", async () => {
	const vault = new MemoryVaultOps();
	const outcome = await run(deps(vault, { detailResponse: (id) => (id === ids.memo ? status(429, { "Retry-After": "60" }) : undefined) }));
	assert.equal(outcome.status, "ok");
	assert.ok(outcome.report.incomplete);
	assert.ok(vault.paths().length > 0);
});

test("the base-folder guard stops the first sync and writes nothing", async () => {
	const vault = new MemoryVaultOps({ "Pocket/From another tool.md": "---\n{}\n---\nold" });
	const outcome = await run(deps(vault));
	assert.equal(outcome.status, "aborted");
	assert.match(outcome.message ?? "", /another base folder/);
	assert.deepEqual(vault.writes, []);
});

test("a missing API key stops the run", async () => {
	const d = { ...deps(new MemoryVaultOps()), apiKey: () => null };
	assert.equal((await run(d)).status, "aborted");
});

test("two devices syncing one vault at once converge with no suffixed copies", async () => {
	const vault = new MemoryVaultOps();
	const [laptop, phone] = await Promise.all([run(deps(vault, { yieldEachRequest: true })), run(deps(vault, { yieldEachRequest: true }))]);
	assert.equal(laptop.status, "ok");
	assert.equal(phone.status, "ok");
	assert.deepEqual(vault.paths(), EXPECTED);
	assert.ok(!vault.paths().some((path) => / \([0-9a-f]{6}\)/.test(path)));
	assert.equal(laptop.report.conflicts.length + phone.report.conflicts.length, 0);
	vault.writes.length = 0;
	await run(deps(vault));
	assert.deepEqual(vault.writes, []);
});

test("re-sync everything refetches every in-scope recording", async () => {
	const vault = new MemoryVaultOps();
	await run(deps(vault));
	const d = deps(vault);
	await run(d, true);
	assert.equal(d.calls.filter((url) => /\/public\/recordings\/./.test(url.pathname)).length, 5);
});

test("an unload mid-run cancels it", async () => {
	const vault = new MemoryVaultOps();
	let cancelled = false;
	const d = { ...deps(vault), waitForResolved: async () => {}, cancelled: () => cancelled };
	const pending = run(d);
	cancelled = true;
	assert.equal((await pending).status, "cancelled");
});
