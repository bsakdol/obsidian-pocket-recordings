import assert from "node:assert/strict";
import { test } from "node:test";

import { ShapeError } from "../src/pocket/errors";
import { isFinishedState, mapDetail, mapListed } from "../src/pocket/mappers";
import { detailFixture, ids, listedFixture, listedFixtures } from "./support/fixtures";

test("the listing fixtures map, with folder ids, tags, and finished state", () => {
	const listed = listedFixtures();
	assert.equal(listed.length, 6);
	assert.equal(listedFixture(ids.memo).folderId, null);
	assert.equal(listedFixture(ids.acme).folderId, "fd-acme-0003");
	assert.deepEqual(listedFixture(ids.idea).tags.map((tag) => tag.name), ["highlights"]);
	assert.equal(listedFixture(ids.processing).isFinished, false);
	assert.equal(listedFixture(ids.doctor).isFinished, true);
});

test("unfinished states are held and every other state counts as finished", () => {
	for (const state of ["processing", "Transcribing", "summarizing", "pending"]) assert.equal(isFinishedState(state), false, state);
	for (const state of ["completed", "failed", "some_future_state"]) assert.equal(isFinishedState(state), true, state);
});

test("a listing item without an id throws rather than vanishing", () => {
	assert.throws(() => mapListed({ title: "x", recording_at: "2026-11-01T00:00:00Z" }), ShapeError);
});

test("the detail fixture yields speaker names, every output, and ticks", () => {
	const detail = detailFixture(ids.acme);
	assert.deepEqual(detail.speakers, ["Dana", "Lee"]);
	assert.equal(detail.transcript?.[0]?.speaker, "Dana");
	assert.equal(detail.summary?.emoji, "🚀");
	assert.deepEqual(detail.actionItems?.map((item) => [item.id, item.completed, item.dueDate]), [
		["ai-0001", false, "2026-11-14"],
		["ai:0002/x", true, null],
	]);
	assert.equal(detail.mindMaps.length, 1);
	assert.equal(detail.mindMaps[0]?.roots[0]?.children[0]?.children[0]?.title, "Pilot");
	assert.equal(detail.translation, null);
});

test("a missing or empty speakerName falls back to the raw speaker label", () => {
	const detail = detailFixture(ids.memo);
	assert.deepEqual(detail.transcript?.map((segment) => segment.speaker), ["SPEAKER_00", "SPEAKER_00"]);
});

test("every mind-map variant present is kept, including unknown ones", () => {
	const detail = detailFixture(ids.memo);
	assert.deepEqual(detail.mindMaps.map((variant) => variant.name), ["Outline", "Timeline"]);
	const listed = listedFixture(ids.acme);
	const odd = mapDetail({ id: ids.acme, summarizations: { s: { processingStatus: "completed", v2: { mindMap: { radialFancy: { title: "Root", children: [] } } } } } }, listed);
	assert.deepEqual(odd.mindMaps.map((variant) => variant.name), ["Radial fancy"]);
});

test("a completed translation renders translated text, the transcript the original", () => {
	const detail = detailFixture(ids.memo);
	assert.equal(detail.transcript?.[0]?.text, "Recuerda comprar leche.");
	assert.equal(detail.translation?.[0]?.text, "Remember to buy milk.");
	assert.equal(detail.translationLanguage, "en");
});

test("simple action items use their label", () => {
	assert.deepEqual(detailFixture(ids.idea).actionItems?.map((item) => item.title), ["Sketch the design"]);
});

test("a detail missing summarizations maps to a recording with no outputs, not an error", () => {
	const detail = detailFixture(ids.doctor);
	assert.equal(detail.summary, null);
	assert.equal(detail.actionItems, null);
	assert.deepEqual(detail.mindMaps, []);
	assert.equal(detail.transcript?.length, 1);
});

test("a malformed detail is a ShapeError for that recording", () => {
	assert.throws(() => mapDetail("nope", listedFixture(ids.acme)), ShapeError);
	assert.throws(() => mapDetail({ id: "someone-else" }, listedFixture(ids.acme)), ShapeError);
});

test("the newest completed summarization wins", () => {
	const listed = listedFixture(ids.acme);
	const detail = mapDetail(
		{
			id: ids.acme,
			summarizations: {
				old: { processingStatus: "completed", updatedAt: "2026-11-01T00:00:00Z", v2: { summary: { markdown: "old" } } },
				newer: { processingStatus: "completed", updatedAt: "2026-11-02T00:00:00Z", v2: { summary: { markdown: "newer" } } },
				failing: { processingStatus: "failed", updatedAt: "2026-11-03T00:00:00Z", v2: { summary: { markdown: "broken" } } },
			},
		},
		listed,
	);
	assert.equal(detail.summary?.markdown, "newer");
});
