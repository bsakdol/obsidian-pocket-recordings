import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitize } from "../scripts/sanitize-fixtures.mjs";

const raw = {
	success: true,
	data: {
		id: "rec_9f8e7d6c5b4a",
		title: "Quarterly planning with Alice Johnson",
		state: "completed",
		recording_at: "2026-11-10T23:30:00.000Z",
		duration: 1834,
		folder_id: "fld_123456",
		recorded_by: { display_name: "Bradley Example", email: "someone@example.com", user_id: "usr_abcdef" },
		speakers: { SPEAKER_00: { name: "Alice Johnson", speakerId: "SPEAKER_00" } },
		tags: [{ id: "tag_1", name: "highlights", color: "#ff0000" }, { id: "tag_2", name: "Confidential", color: "#00ff00" }],
		transcript: {
			segments: [
				{ start: 0, end: 4.2, speaker: "SPEAKER_00", speakerName: "Alice Johnson", text: "Let's review the budget.", originalText: "Let's review the budget." },
				{ start: 4.2, end: 9, speaker: "SPEAKER_00", speakerName: "Alice Johnson", text: "Approved by Monday.", originalText: "Approved by Monday." },
			],
		},
		summarizations: {
			sum_1: {
				processingStatus: "completed",
				v2: {
					summary: { title: "Budget review", markdown: "## Highlights\n- Approved the budget\n- Hire two engineers" },
					actionItems: { actionItems: [{ id: "ai_77", title: "Send proposal", isCompleted: false, dueDate: "2026-11-14" }] },
				},
			},
		},
	},
};

function strings(value: unknown, path = ""): { path: string; value: string }[] {
	if (typeof value === "string") return [{ path, value }];
	if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
	if (value && typeof value === "object") {
		return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));
	}
	return [];
}

function keyPaths(value: unknown, path = ""): string[] {
	if (Array.isArray(value)) return value.flatMap((item, index) => keyPaths(item, `${path}[${index}]`));
	if (value && typeof value === "object") {
		return Object.entries(value).flatMap(([key, child]) => [`${path}.${key}`, ...keyPaths(child, `${path}.${key}`)]);
	}
	return [];
}

const ID_PATH = /(\.id|_id|Id|\.speaker)$/;
const ENUM_PATH = /\.(state|color|processingStatus)$/;
const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;

test("no original string value longer than 3 characters survives, other than ids, enums, and timestamps", () => {
	const out = sanitize(raw, new Set(["highlights"]));
	const outputValues = new Set(strings(out).map((entry) => entry.value));
	const leaked = strings(raw).filter(
		(entry) =>
			entry.value.length > 3 &&
			outputValues.has(entry.value) &&
			!ID_PATH.test(entry.path) &&
			!ENUM_PATH.test(entry.path) &&
			!ISO.test(entry.value) &&
			entry.value !== "highlights",
	);
	assert.deepEqual(leaked, []);
});

test("no original word longer than 3 characters appears anywhere in free text", () => {
	const serialized = JSON.stringify(sanitize(raw));
	for (const word of ["Alice", "Johnson", "Quarterly", "budget", "Bradley", "someone", "proposal", "Confidential", "Monday"]) {
		assert.ok(!serialized.includes(word), `${word} leaked`);
	}
});

test("the output keeps every key path of the input", () => {
	assert.deepEqual(keyPaths(sanitize(raw)), keyPaths(raw));
});

test("ids, states, timestamps, numbers, and kept values pass through", () => {
	const out = sanitize(raw, new Set(["highlights"])) as typeof raw;
	assert.equal(out.data.id, raw.data.id);
	assert.equal(out.data.state, "completed");
	assert.equal(out.data.recording_at, raw.data.recording_at);
	assert.equal(out.data.duration, 1834);
	assert.equal(out.data.tags[0]?.name, "highlights");
	assert.equal(out.data.summarizations.sum_1.v2.actionItems.actionItems[0]?.id, "ai_77");
	assert.equal(out.data.summarizations.sum_1.v2.actionItems.actionItems[0]?.dueDate, "2026-11-14");
});

test("text keeps its markdown structure and length", () => {
	const out = sanitize(raw) as typeof raw;
	const markdown = out.data.summarizations.sum_1.v2.summary.markdown;
	assert.equal(markdown.length, raw.data.summarizations.sum_1.v2.summary.markdown.length);
	assert.match(markdown, /^## \w+\n- \w+/);
});

test("raw speaker labels are kept, so segments still match the speakers map, while names are scrubbed", () => {
	const out = sanitize(raw) as typeof raw;
	const [first] = out.data.transcript.segments;
	assert.equal(first?.speaker, "SPEAKER_00");
	assert.ok(out.data.speakers.SPEAKER_00);
	assert.notEqual(first?.speakerName, "Alice Johnson");
});
