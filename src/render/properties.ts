import type { ListedRecording, RecordingKind } from "../model";
import type { FolderTree } from "../pocket/folders";
import type { Role, Settings } from "../settings/schema";

/** Properties the user can choose to write. Deselected ones are removed from notes. */
export const SELECTABLE_PROPERTIES = {
	pocket_space: "propSpace",
	pocket_folder: "propFolder",
	pocket_speakers: "propSpeakers",
	pocket_tags: "propTags",
	pocket_duration: "propDuration",
	pocket_language: "propLanguage",
} as const satisfies Record<string, keyof Settings>;

export type PropertyValue = string | number | string[] | null;

export interface PropertySet {
	/** Values to write. Never `tags` or anything outside `pocket_*`. */
	set: Record<string, PropertyValue>;
	/** Plugin properties to delete: deselected metadata, or metadata that no longer has a value. */
	remove: string[];
}

export interface PropertyInput {
	recording: ListedRecording & { speakers?: string[] };
	kind: RecordingKind;
	role: Role;
	settings: Settings;
	tree: FolderTree | null;
	renderFingerprint: string;
}

/**
 * The identity and metadata properties of a conversation or insight note. Placement and status
 * (`pocket_placed_path`, `pocket_status`) are decided by the planner, not here.
 */
export function buildProperties(input: PropertyInput): PropertySet {
	const { recording, settings } = input;
	const set: Record<string, PropertyValue> = {
		pocket_id: recording.id,
		pocket_role: input.role,
		pocket_kind: input.kind,
		pocket_title: recording.title,
		pocket_recorded_at: recording.recordingAt,
		pocket_folder_id: recording.folderId,
	};
	const chain = recording.folderId && input.tree ? (input.tree.chain(recording.folderId) ?? []) : [];
	const space = chain[0]?.isSpace ? chain[0].name : null;
	const folder = chain.filter((node) => !node.isSpace).map((node) => node.name).join("/") || null;
	const candidates: Record<keyof typeof SELECTABLE_PROPERTIES, PropertyValue> = {
		pocket_space: space,
		pocket_folder: folder,
		pocket_speakers: recording.speakers && recording.speakers.length > 0 ? recording.speakers : null,
		pocket_tags: recording.tags.length > 0 ? recording.tags.map((tag) => tag.name) : null,
		pocket_duration: recording.durationSeconds !== null ? Math.round(recording.durationSeconds / 60) : null,
		pocket_language: recording.language,
	};
	const remove: string[] = [];
	for (const [property, setting] of Object.entries(SELECTABLE_PROPERTIES) as [keyof typeof SELECTABLE_PROPERTIES, keyof Settings][]) {
		const value = candidates[property];
		if (settings[setting] === true && value !== null) set[property] = value;
		else remove.push(property);
	}
	// Change-detection keys go last, so an interrupted write is redone by the next sync.
	set.pocket_updated_at = recording.updatedAt;
	set.pocket_render = input.renderFingerprint;
	return { set, remove };
}
