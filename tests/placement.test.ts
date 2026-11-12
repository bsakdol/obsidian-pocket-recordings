import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListedRecording } from "../src/model";
import { pathKey } from "../src/paths/pathKey";
import { placeRecording, resolveCollisions, rolesFor, rollupPath, type Occupancy } from "../src/paths/placement";
import { folderTree, ids, listedFixture } from "./support/fixtures";
import { settingsWith } from "./support/settings";

const tree = folderTree();

test("Pocket-folder scheme: a nested folder", () => {
	const placement = placeRecording(listedFixture(ids.acme), "conversation", tree, settingsWith());
	assert.equal(placement.anchor, "Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff");
	assert.deepEqual(placement.files, {
		main: "Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff/Acme kickoff.md",
		transcript: "Pocket/Conversations/Work/Clients/Acme Q4/2026-11-10/2026-11-10 Acme kickoff/Acme kickoff - Transcript.md",
	});
});

test("Pocket-folder scheme: a space-only recording and an unfiled one", () => {
	assert.equal(placeRecording(listedFixture(ids.weekly), "conversation", tree, settingsWith()).anchor, "Pocket/Conversations/Work/2026-11-09/2026-11-09 Weekly sync");
	assert.equal(placeRecording(listedFixture(ids.memo), "conversation", tree, settingsWith()).anchor, "Pocket/Conversations/Unfiled/2026-11-08/2026-11-08 Voice memo");
});

test("an unknown folder id files under Unfiled and is flagged uncertain", () => {
	const placement = placeRecording({ ...listedFixture(ids.acme), folderId: "fd-gone" }, "conversation", tree, settingsWith());
	assert.equal(placement.uncertain, true);
	assert.match(placement.anchor, /^Pocket\/Conversations\/Unfiled\//);
});

test("date scheme with each granularity", () => {
	const recording = listedFixture(ids.acme);
	const at = (granularity: "YYYY-MM-DD" | "YYYY-MM" | "YYYY/MM/DD") => placeRecording(recording, "conversation", null, settingsWith({ scheme: "date", granularity })).anchor;
	assert.equal(at("YYYY-MM-DD"), "Pocket/Conversations/2026-11-10/2026-11-10 Acme kickoff");
	assert.equal(at("YYYY-MM"), "Pocket/Conversations/2026-11/2026-11-10 Acme kickoff");
	assert.equal(at("YYYY/MM/DD"), "Pocket/Conversations/2026/11/10/2026-11-10 Acme kickoff");
});

test("the vault time zone decides the date folder", () => {
	const recording = listedFixture(ids.weekly); // 2026-11-09T23:30Z
	assert.match(placeRecording(recording, "conversation", null, settingsWith({ scheme: "date", timeZone: "Pacific/Auckland" })).anchor, /\/2026-11-10\//);
	assert.match(placeRecording(recording, "conversation", null, settingsWith({ scheme: "date", timeZone: "America/Chicago" })).anchor, /\/2026-11-09\//);
});

test("titles are sanitized and an empty title falls back to the id", () => {
	const recording = { ...listedFixture(ids.acme), title: '  ..Q4: "plan" <draft>? 🚀 ' };
	const placement = placeRecording(recording, "conversation", null, settingsWith({ scheme: "date" }));
	assert.equal(placement.files.main, "Pocket/Conversations/2026-11-10/2026-11-10 Q4 plan draft 🚀/Q4 plan draft 🚀.md");
	const untitled = placeRecording({ ...recording, title: "" }, "conversation", null, settingsWith({ scheme: "date" }));
	assert.equal(untitled.files.main, `Pocket/Conversations/2026-11-10/2026-11-10 ${ids.acme}/${ids.acme}.md`);
});

test("each layout yields the right role set", () => {
	assert.deepEqual(rolesFor("conversation", settingsWith()), ["main", "transcript"]);
	assert.deepEqual(rolesFor("conversation", settingsWith({ outputTranscript: false })), ["main"]);
	assert.deepEqual(rolesFor("conversation", settingsWith({ layout: "per-output" })), ["summary", "action-items", "mind-map", "transcript", "translation"]);
	assert.deepEqual(rolesFor("conversation", settingsWith({ layout: "per-output", outputMindMaps: false, outputTranslation: false })), ["summary", "action-items", "transcript"]);
	assert.deepEqual(rolesFor("conversation", settingsWith({ layout: "single" })), ["single"]);
	assert.deepEqual(rolesFor("insight", settingsWith()), ["insight"]);
	assert.deepEqual(rolesFor("insight", settingsWith({ insightShape: "rollup" })), []);
});

test("insights go under Insights by date, and rollups by their date", () => {
	assert.equal(placeRecording(listedFixture(ids.idea), "insight", tree, settingsWith()).files.insight, "Pocket/Insights/2026-11-10/2026-11-10 Big idea.md");
	assert.equal(rollupPath("2026-11-10", settingsWith()), "Pocket/Insights/2026-11-10/2026-11-10 Highlights.md");
	assert.equal(rollupPath("2026-11-10", settingsWith({ granularity: "YYYY/MM/DD", timeZone: "Pacific/Auckland" })), "Pocket/Insights/2026/11/10/2026-11-10 Highlights.md");
});

function twin(id: string, recordingAt: string, title = "Standup"): ListedRecording {
	return { ...listedFixture(ids.acme), id, title, recordingAt, folderId: null };
}

const free = (): Occupancy => ({ kind: "free" });
const settings = settingsWith({ scheme: "date" });
const place = (recording: ListedRecording) => placeRecording(recording, "conversation", null, settings);

test("same title and date: the earlier keeps the plain path, the later gets a 6-character id suffix", () => {
	const early = place(twin("aaaaaa-early", "2026-11-10T09:00:00Z"));
	const late = place(twin("bbbbbb-late", "2026-11-10T10:00:00Z"));
	const [a, b] = resolveCollisions([late, early], free);
	assert.equal(a?.anchor, "Pocket/Conversations/2026-11-10/2026-11-10 Standup (bbbbbb)");
	assert.equal(a?.files.main, "Pocket/Conversations/2026-11-10/2026-11-10 Standup (bbbbbb)/Standup.md");
	assert.equal(b?.anchor, "Pocket/Conversations/2026-11-10/2026-11-10 Standup");
});

test("targets differing only in case or NFC versus NFD are one collision", () => {
	const one = place(twin("111111-a", "2026-11-10T09:00:00Z", "Café"));
	const two = place(twin("222222-b", "2026-11-10T10:00:00Z", "CAFÉ"));
	const [a, b] = resolveCollisions([one, two], free);
	assert.equal(a?.anchor.endsWith("Café"), true);
	assert.equal(b?.anchor.endsWith("(222222)"), true);
});

test("a path occupied by a non-plugin file forces the suffix", () => {
	const only = place(twin("cccccc-x", "2026-11-10T09:00:00Z"));
	const taken = pathKey(only.anchor);
	const [a] = resolveCollisions([only], (anchor) => (pathKey(anchor) === taken ? { kind: "foreign" } : { kind: "free" }));
	assert.equal(a?.anchor.endsWith("(cccccc)"), true);
	const [own] = resolveCollisions([only], () => ({ kind: "owned", ids: new Set(["cccccc-x"]) }));
	assert.equal(own?.anchor, only.anchor);
});

test("ties on recording_at resolve by id, whatever the input order", () => {
	const x = place(twin("zzzzzz-1", "2026-11-10T09:00:00Z"));
	const y = place(twin("mmmmmm-2", "2026-11-10T09:00:00Z"));
	for (const order of [[x, y], [y, x]]) {
		const result = new Map(resolveCollisions(order, free).map((p) => [p.id, p.anchor]));
		assert.equal(result.get("mmmmmm-2"), "Pocket/Conversations/2026-11-10/2026-11-10 Standup");
		assert.equal(result.get("zzzzzz-1"), "Pocket/Conversations/2026-11-10/2026-11-10 Standup (zzzzzz)");
	}
});
