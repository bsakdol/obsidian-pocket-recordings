// Counts what a structure change would do, offline, from note properties and the cached folder
// tree, so the user is asked once before anything moves.

import type { ListedRecording, RecordingKind } from "../model";
import { pathKey } from "../paths/pathKey";
import { placeRecording, rollupPath } from "../paths/placement";
import { FolderTree } from "../pocket/folders";
import { pickStructure, type Settings } from "../settings/schema";
import { checkBaseFolder } from "./baseGuard";
import type { IdentityIndex, NoteRecord } from "./identityIndex";

export type SwitchEvaluation =
	| { kind: "blocked"; message: string }
	| {
			kind: "count";
			/** Recordings whose placement or note set would change. */
			affected: number;
			/** Of those, recordings the user moved: they update in place and do not move. */
			userMoved: number;
	  };

/** The recording a set of notes describes, rebuilt from their properties. */
function recordingOf(notes: NoteRecord[]): (ListedRecording & { kind: RecordingKind }) | null {
	const source = notes.find((n) => n.recordedAt && n.id);
	if (!source?.id || !source.recordedAt) return null;
	return {
		id: source.id,
		title: source.title ?? "",
		recordingAt: source.recordedAt,
		updatedAt: source.updatedAt ?? source.recordedAt,
		durationSeconds: null,
		state: null,
		language: null,
		folderId: source.folderId ?? null,
		tags: [],
		isFinished: true,
		kind: source.kind ?? "conversation",
	};
}

function targets(recording: ListedRecording, kind: RecordingKind, tree: FolderTree, settings: Settings): string[] {
	const placement = placeRecording(recording, kind, tree, settings);
	return Object.entries(placement.files)
		.map(([role, path]) => `${role}=${pathKey(path)}`)
		.sort();
}

/**
 * What applying `draft` over `current` would do. A new base folder holding notes this plugin did
 * not create refuses the switch. Frozen and duplicate recordings, and notes marked deleted
 * or excluded, are left out: the switch does not touch them.
 */
export function evaluateSwitch(index: IdentityIndex, tree: FolderTree | null, current: Settings, draft: Settings): SwitchEvaluation {
	if (pathKey(draft.baseFolder) !== pathKey(current.baseFolder)) {
		const guard = checkBaseFolder(index.files, draft.baseFolder);
		if (!guard.ok) return { kind: "blocked", message: guard.message };
	}
	const next: Settings = { ...current, ...pickStructure(draft) };
	// Without a cached tree every folder is unknown under both settings alike, so only the other
	// structure differences are counted.
	const folders = tree ?? FolderTree.fromNodes([]);
	let affected = 0;
	let userMoved = 0;
	for (const [identity, roles] of index.byIdentity) {
		if (index.duplicates.has(identity)) continue;
		const notes = [...roles.values()].flat();
		if (notes.some((n) => n.frozen)) continue;
		const active = notes.filter((n) => n.status === null);
		if (active.length === 0) continue;

		let changes: boolean;
		if (identity.startsWith("rollup:")) {
			const date = identity.slice("rollup:".length);
			changes = next.insightShape !== current.insightShape || pathKey(rollupPath(date, next)) !== pathKey(rollupPath(date, current));
		} else {
			const recording = recordingOf(active);
			if (!recording) continue;
			changes = JSON.stringify(targets(recording, recording.kind, folders, current)) !== JSON.stringify(targets(recording, recording.kind, folders, next));
		}
		if (!changes) continue;
		affected += 1;
		if (active.some((n) => n.placedPath !== null && pathKey(n.path) !== pathKey(n.placedPath))) userMoved += 1;
	}
	return { kind: "count", affected, userMoved };
}
