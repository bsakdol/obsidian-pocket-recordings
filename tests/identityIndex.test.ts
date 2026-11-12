import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIndexWhenReady, recordingIdentity, VaultIndexingError } from "../src/sync/identityIndex";
import { MemoryVaultOps } from "./support/memoryVaultOps";

const note = (props: Record<string, unknown>) => `---\n${JSON.stringify(props)}\n---\nbody`;

test("the index groups a recording's notes, flags duplicates, and follows notes moved outside the base", async () => {
	const vault = new MemoryVaultOps({
		"Pocket/Conversations/a/Main.md": note({ pocket_id: "r1", pocket_role: "main" }),
		"Pocket/Conversations/a/Transcript.md": note({ pocket_id: "r1", pocket_role: "transcript" }),
		"Projects/Moved.md": note({ pocket_id: "r2", pocket_role: "main" }),
		"Pocket/Conversations/b/Main.md": note({ pocket_id: "r3", pocket_role: "main" }),
		"Pocket/Conversations/b/Main copy.md": note({ pocket_id: "r3", pocket_role: "main" }),
		"Pocket/Insights/2026-11-10 Highlights.md": note({ pocket_rollup_date: "2026-11-10", pocket_role: "rollup" }),
		"Notes/Unrelated.md": note({ title: "mine" }),
		"Notes/Old plugin.md": note({ recording_id: "r1" }),
	});
	const index = await buildIndexWhenReady(vault, async () => {});
	assert.deepEqual([...(index.byIdentity.get(recordingIdentity("r1"))?.keys() ?? [])].sort(), ["main", "transcript"]);
	assert.equal(index.byIdentity.get(recordingIdentity("r2"))?.get("main")?.[0]?.path, "Projects/Moved.md");
	assert.deepEqual([...index.duplicates], [recordingIdentity("r3")]);
	assert.ok(index.byIdentity.has("rollup:2026-11-10"));
	assert.equal(index.notes.length, 6);
});

test("a markdown file with no cache entry triggers a retry, then aborts with 'vault still indexing'", async () => {
	const vault = new MemoryVaultOps({ "Pocket/a.md": note({ pocket_id: "r1", pocket_role: "main" }) });
	vault.uncached.add("Pocket/a.md");
	let waits = 0;
	await assert.rejects(
		buildIndexWhenReady(vault, async () => {
			waits += 1;
		}),
		(error: unknown) => error instanceof VaultIndexingError && /still indexing/.test(error.message),
	);
	assert.equal(waits, 3);
});

test("the index is built once the cache catches up", async () => {
	const vault = new MemoryVaultOps({ "Pocket/a.md": note({ pocket_id: "r1", pocket_role: "main" }) });
	vault.uncached.add("Pocket/a.md");
	const index = await buildIndexWhenReady(vault, async () => {
		vault.uncached.clear();
	});
	assert.equal(index.notes.length, 1);
});

test("the memory vault matches Obsidian's semantics", async () => {
	const vault = new MemoryVaultOps({ "A/x.md": "x" });
	await assert.rejects(vault.createNote("A/x.md", {}, "y"));
	await assert.rejects(vault.rename("A/x.md", "Missing/x.md"));
	await assert.rejects(vault.createNote("Missing/y.md", {}, "y"));
	await vault.ensureFolder("B/C");
	await vault.rename("A/x.md", "B/C/x.md");
	assert.equal(await vault.removeFolderIfEmpty("A"), true);
	assert.equal(await vault.removeFolderIfEmpty("B"), false);
});
