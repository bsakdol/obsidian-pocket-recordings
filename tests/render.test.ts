import assert from "node:assert/strict";
import { test } from "node:test";

import { renderConversationRole, type RenderInput } from "../src/render/conversation";
import { buildProperties } from "../src/render/properties";
import { detailFixture, folderTree, ids } from "./support/fixtures";
import { settingsWith } from "./support/settings";

const siblings = {
	main: "Pocket/Conversations/x/Acme kickoff.md",
	transcript: "Pocket/Conversations/x/Acme kickoff - Transcript.md",
};

function input(overrides: Partial<RenderInput> = {}): RenderInput {
	return { detail: detailFixture(ids.acme), role: "main", settings: settingsWith(), siblings, ticks: new Set(), ...overrides };
}

test("the main note holds summary, action items, and mind map, and links the transcript", () => {
	const body = renderConversationRole(input());
	assert.ok(body.startsWith("Related: [[Pocket/Conversations/x/Acme kickoff - Transcript|Transcript]]"));
	assert.ok(body.includes("## Summary\n\n## Overview"));
	assert.ok(body.includes("## Action items\n\n- [ ] Send proposal (due 2026-11-14) ^pocket-ai-0001"));
	assert.ok(body.includes("## Mind map\n\n### Mind map\n\n- Acme kickoff\n\t- Scope\n\t\t- Pilot\n\t- Timeline"));
	assert.ok(!body.includes("## Transcript"));
	assert.ok(body.indexOf("## Summary") < body.indexOf("## Action items"));
});

test("the transcript shows speaker names, with timestamps on or off", () => {
	const on = renderConversationRole(input({ role: "transcript" }));
	assert.ok(on.includes("**[0:00] Dana:** Welcome to the kickoff."));
	assert.ok(on.includes("**[1:02:05] Dana:** Let's wrap up."));
	const off = renderConversationRole(input({ role: "transcript", settings: settingsWith({ transcriptTimestamps: false }) }));
	assert.ok(off.includes("**Lee:** Thanks, glad to start."));
});

test("raw labels are the fallback speaker", () => {
	const body = renderConversationRole(input({ detail: detailFixture(ids.memo), role: "transcript" }));
	assert.ok(body.includes("**[0:00] SPEAKER_00:** Recuerda comprar leche."));
});

test("only the outputs Pocket produced render; absent mind-map variants have no heading", () => {
	const body = renderConversationRole(input({ detail: detailFixture(ids.doctor), role: "single", settings: settingsWith({ layout: "single" }), siblings: {} }));
	assert.ok(!body.includes("## Summary"));
	assert.ok(!body.includes("## Mind map"));
	assert.ok(!body.includes("## Action items"));
	assert.ok(body.includes("## Transcript"));
	const memo = renderConversationRole(input({ detail: detailFixture(ids.memo), role: "mind-map", settings: settingsWith({ layout: "per-output" }), siblings: {} }));
	assert.ok(memo.includes("### Outline") && memo.includes("### Timeline"));
});

test("a per-output note with nothing from Pocket says so", () => {
	const body = renderConversationRole(input({ detail: detailFixture(ids.doctor), role: "action-items", settings: settingsWith({ layout: "per-output" }), siblings: {} }));
	assert.equal(body, "_Pocket has no action items for this recording yet._");
});

test("section order follows the setting in a single note", () => {
	const settings = settingsWith({ layout: "single", sectionOrder: ["transcript", "mind-map", "action-items", "summary", "translation"] });
	const body = renderConversationRole(input({ role: "single", settings, siblings: {} }));
	assert.ok(body.indexOf("## Transcript") < body.indexOf("## Mind map"));
	assert.ok(body.indexOf("## Action items") < body.indexOf("## Summary"));
});

test("translation renders in the main note by default", () => {
	const body = renderConversationRole(input({ detail: detailFixture(ids.memo) }));
	assert.ok(body.includes("## Translation (en)\n\n**[0:00] SPEAKER_00:** Remember to buy milk."));
});

test("inline tags render when enabled", () => {
	const body = renderConversationRole(input({ settings: settingsWith({ inlineTags: true }) }));
	assert.ok(body.includes("#pocket/internal"));
});

test("rendering twice from the same input is byte-identical", () => {
	assert.equal(renderConversationRole(input()), renderConversationRole(input()));
	assert.equal(renderConversationRole(input({ role: "transcript" })), renderConversationRole(input({ role: "transcript" })));
});

test("the property set never contains tags, and a deselected property is removed", () => {
	const detail = detailFixture(ids.acme);
	const props = buildProperties({ recording: detail, kind: "conversation", role: "main", settings: settingsWith({ propSpeakers: false }), tree: folderTree(), renderFingerprint: "abc" });
	assert.ok(!("tags" in props.set));
	assert.ok(Object.keys(props.set).every((key) => key.startsWith("pocket_")));
	assert.ok(props.remove.includes("pocket_speakers"));
	assert.equal(props.set.pocket_space, "Work");
	assert.equal(props.set.pocket_folder, "Clients/Acme: Q4");
	assert.deepEqual(props.set.pocket_tags, ["internal"]);
	assert.equal(props.set.pocket_duration, 31);
	const keys = Object.keys(props.set);
	assert.deepEqual(keys.slice(-2), ["pocket_updated_at", "pocket_render"]);
});
