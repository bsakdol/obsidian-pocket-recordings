import type { ListedRecording, RecordingKind } from "../model";
import { UNFILED, type FolderTree } from "../pocket/folders";
import type { Role, Settings } from "../settings/schema";
import { basenameOf, joinPath, parentOf, pathKey } from "./pathKey";
import { safeSegment } from "./sanitize";
import { fillTemplate } from "./template";
import { localParts } from "./time";

export const CONVERSATIONS_FOLDER = "Conversations";
export const INSIGHTS_FOLDER = "Insights";

/** Where one recording's notes belong, before and after collision handling. */
export interface Placement {
	id: string;
	kind: RecordingKind;
	recordingAt: string;
	/**
	 * The unit collisions are decided on: the recording folder for a conversation, the note itself
	 * for an insight.
	 */
	anchor: string;
	/** Full vault path (with `.md`) of each role's note. */
	files: Partial<Record<Role, string>>;
	/** True when the recording's Pocket folder is not in the tree, so the folder part is a guess. */
	uncertain: boolean;
}

const ROLE_TEMPLATE: Record<Exclude<Role, "rollup">, keyof Settings> = {
	main: "templateMain",
	single: "templateSingle",
	transcript: "templateTranscript",
	summary: "templateSummary",
	"action-items": "templateActionItems",
	"mind-map": "templateMindMap",
	translation: "templateTranslation",
	insight: "templateInsight",
};

/** The roles a recording's notes take under the current layout and enabled outputs. */
export function rolesFor(kind: RecordingKind, settings: Settings): Role[] {
	if (kind === "insight") {
		return settings.insightShape === "per-recording" ? ["insight"] : [];
	}
	switch (settings.layout) {
		case "single":
			return ["single"];
		case "main-transcript":
			return settings.outputTranscript ? ["main", "transcript"] : ["main"];
		case "per-output": {
			const roles: Role[] = [];
			if (settings.outputSummary) roles.push("summary");
			if (settings.outputActionItems) roles.push("action-items");
			if (settings.outputMindMaps) roles.push("mind-map");
			if (settings.outputTranscript) roles.push("transcript");
			if (settings.outputTranslation) roles.push("translation");
			// With every output off a recording still keeps one note, so its identity survives.
			return roles.length > 0 ? roles : ["main"];
		}
	}
}

/** The date folder for `iso` at the configured granularity. */
export function dateFolder(iso: string, settings: Settings): string {
	const { year, month, day } = localParts(iso, settings.timeZone);
	return dateFolderOf(year, month, day, settings);
}

function dateFolderOf(year: string, month: string, day: string, settings: Settings): string {
	switch (settings.granularity) {
		case "YYYY-MM":
			return `${year}-${month}`;
		case "YYYY/MM/DD":
			return `${year}/${month}/${day}`;
		default:
			return `${year}-${month}-${day}`;
	}
}

function titleOf(recording: Pick<ListedRecording, "id" | "title">): string {
	return safeSegment(recording.title, recording.id);
}

function name(template: string, recording: Pick<ListedRecording, "id" | "title" | "recordingAt">, settings: Settings): string {
	const filled = fillTemplate(template, { id: recording.id, title: titleOf(recording), at: recording.recordingAt, zone: settings.timeZone });
	return safeSegment(filled, recording.id);
}

/**
 * The Pocket-folder part of a conversation's path: space, then folders, with sanitized segments.
 * Unfiled recordings, and those whose folder the tree does not know, go under `Unfiled`.
 */
function pocketFolderSegments(recording: ListedRecording, tree: FolderTree): { segments: string[]; uncertain: boolean } {
	const placement = tree.placement(recording.folderId);
	if (placement.segments.length === 0) {
		return { segments: [UNFILED], uncertain: !placement.known };
	}
	const chain = recording.folderId ? (tree.chain(recording.folderId) ?? []) : [];
	return { segments: chain.map((node) => safeSegment(node.name, `Folder ${node.id.slice(0, 8)}`)), uncertain: false };
}

/**
 * The target of every note a recording needs. `tree` is required under the
 * Pocket-folder scheme; the caller must stop the run when it cannot be read.
 */
export function placeRecording(recording: ListedRecording, kind: RecordingKind, tree: FolderTree | null, settings: Settings): Placement {
	const base = settings.baseFolder;
	const roles = rolesFor(kind, settings);
	if (kind === "insight") {
		const folder = joinPath(base, INSIGHTS_FOLDER, dateFolder(recording.recordingAt, settings));
		const file = `${joinPath(folder, name(settings.templateInsight, recording, settings))}.md`;
		return { id: recording.id, kind, recordingAt: recording.recordingAt, anchor: file, files: roles.includes("insight") ? { insight: file } : {}, uncertain: false };
	}

	let segments: string[] = [];
	let uncertain = false;
	if (settings.scheme === "pocket-folders") {
		if (!tree) throw new Error("The Pocket folder tree is required under the Pocket-folder scheme.");
		({ segments, uncertain } = pocketFolderSegments(recording, tree));
	}
	const folder = joinPath(base, CONVERSATIONS_FOLDER, ...segments, dateFolder(recording.recordingAt, settings), name(settings.templateFolder, recording, settings));
	return { id: recording.id, kind, recordingAt: recording.recordingAt, anchor: folder, files: roleFiles(folder, roles, recording, settings), uncertain };
}

/** One file per role inside `folder`. Roles whose templates render the same name get a role suffix. */
function roleFiles(folder: string, roles: Role[], recording: Pick<ListedRecording, "id" | "title" | "recordingAt">, settings: Settings): Partial<Record<Role, string>> {
	const files: Partial<Record<Role, string>> = {};
	const used = new Set<string>();
	for (const role of roles) {
		if (role === "rollup") continue;
		let base = name(settings[ROLE_TEMPLATE[role]] as string, recording, settings);
		if (used.has(pathKey(base))) base = safeSegment(`${base} - ${role}`, role);
		used.add(pathKey(base));
		files[role] = `${joinPath(folder, base)}.md`;
	}
	return files;
}

/** The path of the daily rollup for a local date `YYYY-MM-DD`. */
export function rollupPath(date: string, settings: Settings): string {
	const [year = "0000", month = "01", day = "01"] = date.split("-");
	const folder = joinPath(settings.baseFolder, INSIGHTS_FOLDER, dateFolderOf(year, month, day, settings));
	// The date is already local to the vault zone, so its tokens are filled in UTC, where nothing shifts it.
	const filled = fillTemplate(settings.templateRollup, { id: date, title: "Highlights", at: `${date}T00:00:00.000Z`, zone: "UTC" });
	return `${joinPath(folder, safeSegment(filled, `${date} Highlights`))}.md`;
}

/** Who occupies a path in the vault, for collision decisions. */
export type Occupancy = { kind: "free" } | { kind: "foreign" } | { kind: "owned"; ids: ReadonlySet<string> };

/**
 * Resolves name collisions deterministically from listing data. Among placements whose
 * anchors share a path key, the earliest recording keeps the plain name (ties by id); the others get
 * ` (<first 6 of id>)`, or the full id if that is taken too. An anchor occupied by anything that is
 * not one of the contenders counts as taken.
 */
export function resolveCollisions(placements: Placement[], ownerOf: (anchor: string) => Occupancy): Placement[] {
	const groups = new Map<string, Placement[]>();
	for (const placement of placements) {
		const key = pathKey(placement.anchor);
		groups.set(key, [...(groups.get(key) ?? []), placement]);
	}
	const claimed = new Set<string>();
	const resolved = new Map<string, Placement>();
	// Notes of the contenders themselves never block: the earliest takes the plain name even when a
	// later contender currently sits there, and that later one moves aside.
	const isFree = (anchor: string, contenders: ReadonlySet<string>): boolean => {
		if (claimed.has(pathKey(anchor))) return false;
		const occupant = ownerOf(anchor);
		return occupant.kind === "free" || (occupant.kind === "owned" && [...occupant.ids].every((owner) => contenders.has(owner)));
	};
	const orderedGroups = [...groups.values()].map((group) =>
		[...group].sort((a, b) => (a.recordingAt < b.recordingAt ? -1 : a.recordingAt > b.recordingAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
	);
	// Plain names are claimed first, so a suffixed name never takes a plain name another group needs.
	const pending: Placement[] = [];
	for (const group of orderedGroups) {
		const [first, ...rest] = group;
		if (!first) continue;
		if (isFree(first.anchor, new Set(group.map((placement) => placement.id)))) {
			claimed.add(pathKey(first.anchor));
			resolved.set(first.id, first);
		} else {
			pending.push(first);
		}
		pending.push(...rest);
	}
	for (const placement of pending) {
		const candidates = [withSuffix(placement, placement.id.slice(0, 6)), withSuffix(placement, placement.id)];
		const chosen = candidates.find((candidate) => isFree(candidate.anchor, new Set([candidate.id]))) ?? candidates[1]!;
		claimed.add(pathKey(chosen.anchor));
		resolved.set(placement.id, chosen);
	}
	return placements.map((placement) => resolved.get(placement.id) ?? placement);
}

function withSuffix(placement: Placement, suffix: string): Placement {
	if (placement.kind === "insight") {
		const file = `${joinPath(parentOf(placement.anchor), `${basenameOf(placement.anchor)} (${suffix})`)}.md`;
		const files: Partial<Record<Role, string>> = {};
		for (const role of Object.keys(placement.files) as Role[]) files[role] = file;
		return { ...placement, anchor: file, files };
	}
	const folderName = placement.anchor.slice(placement.anchor.lastIndexOf("/") + 1);
	const folder = joinPath(parentOf(placement.anchor), `${folderName} (${suffix})`);
	const files: Partial<Record<Role, string>> = {};
	for (const [role, path] of Object.entries(placement.files) as [Role, string][]) {
		files[role] = `${joinPath(folder, basenameOf(path))}.md`;
	}
	return { ...placement, anchor: folder, files };
}
