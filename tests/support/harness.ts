import assert from "node:assert/strict";

import type { ListedRecording, RecordingDetail } from "../../src/model";
import type { FolderTree } from "../../src/pocket/folders";
import { mapDetail } from "../../src/pocket/mappers";
import { renderFingerprint } from "../../src/settings/fingerprint";
import type { Settings } from "../../src/settings/schema";
import { execute } from "../../src/sync/executor";
import { buildIndex } from "../../src/sync/identityIndex";
import type { Plan } from "../../src/sync/ops";
import { needsDetails, planOps, type PlanInput } from "../../src/sync/planner";
import type { SyncReport } from "../../src/sync/report";
import { classify, horizonStart } from "../../src/sync/scope";
import { folderTree, rawDetails } from "./fixtures";
import type { MemoryVaultOps } from "./memoryVaultOps";
import { settingsWith } from "./settings";

export const NOW = Date.parse("2026-11-11T12:00:00Z");

export interface CycleOptions {
	settings?: Settings;
	tree?: FolderTree | null;
	resyncAll?: boolean;
	now?: number;
	/** Overrides the detail Pocket returns for a recording; return null to make the fetch fail. */
	detail?: (listed: ListedRecording) => RecordingDetail | null;
}

/**
 * The detail Pocket would return for a listed recording: the captured fixture when there is one,
 * else a small synthetic one. The listing's fields win, so a test that edits the listing (a move, a
 * new title) sees the same change in the detail.
 */
export function detailFor(listed: ListedRecording): RecordingDetail {
	const captured = (rawDetails[listed.id] as { data?: Record<string, unknown> } | undefined)?.data;
	const raw = captured ?? {
		transcript: { segments: [{ start: 0, end: 1, speaker: "S1", speakerName: "Ana", text: `Transcript of ${listed.id}` }] },
		summarizations: {
			s: {
				processingStatus: "completed",
				v2: {
					summary: { markdown: `Summary of ${listed.title}` },
					actionItems: { actionItems: [{ id: `ai-${listed.id}`, title: "Follow up", isCompleted: false }] },
					mindMap: { title: listed.title || "Root", children: [] },
				},
			},
		},
	};
	return mapDetail(
		{
			...raw,
			id: listed.id,
			title: listed.title,
			recording_at: listed.recordingAt,
			updated_at: listed.updatedAt,
			folder_id: listed.folderId,
			tags: listed.tags.map((tag) => ({ id: tag.id, name: tag.name })),
			state: listed.state,
		},
		listed,
	);
}

export function planInput(vault: MemoryVaultOps, listing: ListedRecording[], options: CycleOptions = {}): PlanInput {
	const settings = options.settings ?? settingsWith();
	const tree = options.tree === undefined ? folderTree() : options.tree;
	const now = options.now ?? NOW;
	return {
		scoped: classify(listing, settings, tree, now),
		index: buildIndex(vault.listMarkdown(), vault.allPathKeys()),
		settings,
		tree,
		renderFingerprint: renderFingerprint(settings),
		horizonStartMs: horizonStart(settings, now),
		resyncAll: options.resyncAll,
	};
}

export function planOnly(vault: MemoryVaultOps, listing: ListedRecording[], options: CycleOptions = {}): { plan: Plan; fetched: string[] } {
	const input = planInput(vault, listing, options);
	const need = needsDetails(input);
	const details = new Map<string, RecordingDetail>();
	for (const recording of need) {
		const detail = options.detail ? options.detail(recording) : detailFor(recording);
		if (detail) details.set(recording.id, detail);
	}
	return { plan: planOps(input, details), fetched: need.map((r) => r.id) };
}

export async function syncCycle(vault: MemoryVaultOps, listing: ListedRecording[], options: CycleOptions = {}): Promise<{ plan: Plan; report: SyncReport; fetched: string[] }> {
	const { plan, fetched } = planOnly(vault, listing, options);
	const report = await execute(plan, vault);
	return { plan, report, fetched };
}

/** The idempotence gate: planning again over the vault a cycle produced yields no ops and no fetches. */
export function assertConverged(vault: MemoryVaultOps, listing: ListedRecording[], options: CycleOptions = {}): void {
	const { plan, fetched } = planOnly(vault, listing, options);
	assert.deepEqual(
		plan.ops.map((op) => `${op.kind} ${"path" in op ? op.path : `${op.from} -> ${op.to}`}`),
		[],
		"a second plan should yield no ops",
	);
	assert.deepEqual(fetched, [], "a second plan should fetch nothing");
}

export function opSummary(plan: Plan): string[] {
	return plan.ops.map((op) => {
		switch (op.kind) {
			case "move":
				return `move ${op.from} -> ${op.to}`;
			case "mark":
				return `mark ${op.status} ${op.path}`;
			default:
				return `${op.kind} ${op.path}`;
		}
	});
}
