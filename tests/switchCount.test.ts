import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListedRecording } from "../src/model";
import { buildIndex } from "../src/sync/identityIndex";
import { evaluateSwitch } from "../src/sync/switchCount";
import { folderTree, ids, listedFixture } from "./support/fixtures";
import { syncCycle } from "./support/harness";
import { MemoryVaultOps } from "./support/memoryVaultOps";
import { settingsWith } from "./support/settings";

const base = settingsWith();
const tree = folderTree();

function recording(n: number): ListedRecording {
	const day = String(1 + (n % 28)).padStart(2, "0");
	return { ...listedFixture(ids.acme), id: `rec-${String(n).padStart(4, "0")}`, title: `Meeting ${n}`, recordingAt: `2026-10-${day}T12:00:00.000Z`, updatedAt: `2026-10-${day}T12:00:00.000Z` };
}

async function vaultWith(recordings: ListedRecording[]): Promise<MemoryVaultOps> {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, recordings, { settings: base });
	return vault;
}

const indexOf = (vault: MemoryVaultOps) => buildIndex(vault.listMarkdown(), vault.allPathKeys());

test("switching the layout after 143 synced recordings counts 143", async () => {
	const vault = await vaultWith(Array.from({ length: 143 }, (_, n) => recording(n)));
	assert.deepEqual(evaluateSwitch(indexOf(vault), tree, base, settingsWith({ layout: "per-output" })), { kind: "count", affected: 143, userMoved: 0 });
});

test("switching granularity counts only recordings whose notes would change", async () => {
	const vault = await vaultWith([recording(1), recording(2), recording(3)]);
	// Recording 1 was deleted in Pocket: both of its notes carry the mark, and a switch leaves them be.
	for (const path of vault.paths().filter((p) => p.includes("Meeting 1"))) {
		await vault.processFrontmatter(path, (fm) => {
			fm.pocket_status = "deleted";
		});
	}
	const result = evaluateSwitch(indexOf(vault), tree, base, settingsWith({ granularity: "YYYY-MM" }));
	assert.deepEqual(result, { kind: "count", affected: 2, userMoved: 0 });
});

test("a template change that leaves names identical counts 0", async () => {
	const vault = await vaultWith([recording(1), recording(2)]);
	assert.deepEqual(evaluateSwitch(indexOf(vault), tree, base, settingsWith({ templateMain: "{{ title }}" })), { kind: "count", affected: 0, userMoved: 0 });
	assert.equal((evaluateSwitch(indexOf(vault), tree, base, settingsWith({ templateMain: "{{date}} {{title}}" })) as { affected: number }).affected, 2);
});

test("user-moved recordings are counted and noted as staying in place", async () => {
	const vault = await vaultWith([recording(1), recording(2)]);
	const main = vault.paths().find((path) => path.endsWith("Meeting 1.md")) ?? "";
	await vault.ensureFolder("Projects");
	await vault.rename(main, "Projects/Meeting 1.md");
	assert.deepEqual(evaluateSwitch(indexOf(vault), tree, base, settingsWith({ scheme: "date" })), { kind: "count", affected: 2, userMoved: 1 });
});

test("a new base folder holding foreign notes refuses the switch", async () => {
	const vault = await vaultWith([recording(1)]);
	vault.put("Archive/Old note.md", "---\n{}\n---\nmine");
	const result = evaluateSwitch(indexOf(vault), tree, base, settingsWith({ baseFolder: "Archive" }));
	assert.equal(result.kind, "blocked");
	if (result.kind === "blocked") assert.match(result.message, /another base folder/);
});

test("frozen and duplicate recordings are excluded from the count", async () => {
	const vault = await vaultWith([recording(1), recording(2), recording(3)]);
	const mains = vault.paths().filter((path) => !path.includes("Transcript"));
	await vault.processFrontmatter(mains[0] ?? "", (fm) => {
		fm.pocket_freeze = true;
	});
	vault.put(`${mains[1]?.replace(/\.md$/, "")} copy.md`, vault.files.get(mains[1] ?? "") ?? "");
	assert.deepEqual(evaluateSwitch(indexOf(vault), tree, base, settingsWith({ layout: "single" })), { kind: "count", affected: 1, userMoved: 0 });
});

test("an insight shape switch counts the insights", async () => {
	const vault = new MemoryVaultOps();
	await syncCycle(vault, [listedFixture(ids.idea), listedFixture(ids.acme)]);
	assert.deepEqual(evaluateSwitch(indexOf(vault), tree, base, settingsWith({ insightShape: "rollup" })), { kind: "count", affected: 1, userMoved: 0 });
});
