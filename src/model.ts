// The plugin's view of Pocket data, after mapping from raw payloads. Nothing here imports obsidian.

/** A highlight recording becomes an insight; every other recording is a conversation. */
export type RecordingKind = "conversation" | "insight";

export interface PocketTag {
	id: string;
	name: string;
}

/** A recording as the listing describes it: enough to scope, place, and detect changes. */
export interface ListedRecording {
	id: string;
	title: string;
	/** ISO timestamp of when the recording was made. Never changes. */
	recordingAt: string;
	updatedAt: string;
	durationSeconds: number | null;
	state: string | null;
	language: string | null;
	/** `null` means unfiled. */
	folderId: string | null;
	tags: PocketTag[];
	/** Whether Pocket has finished processing it. */
	isFinished: boolean;
}

export interface TranscriptSegment {
	/** Seconds from the start of the recording. */
	start: number;
	end: number;
	/** The speaker name Pocket assigned, else its raw label. */
	speaker: string;
	text: string;
}

export interface ActionItem {
	id: string;
	title: string;
	completed: boolean;
	dueDate: string | null;
	status: string | null;
	assignee: string | null;
}

export interface MindMapNode {
	title: string;
	children: MindMapNode[];
}

/** One mind map Pocket produced. A recording may carry several. */
export interface MindMapVariant {
	name: string;
	roots: MindMapNode[];
}

export interface Summary {
	title: string;
	emoji: string | null;
	markdown: string;
}

/** A recording with everything its notes are rendered from. Absent outputs are `null` or empty. */
export interface RecordingDetail extends ListedRecording {
	speakers: string[];
	transcript: TranscriptSegment[] | null;
	summary: Summary | null;
	actionItems: ActionItem[] | null;
	mindMaps: MindMapVariant[];
	/** The translated transcript, when Pocket produced one. */
	translation: TranscriptSegment[] | null;
	translationLanguage: string | null;
}
