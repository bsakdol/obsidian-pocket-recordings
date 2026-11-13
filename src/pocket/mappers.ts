import type {
	ActionItem,
	ListedRecording,
	MindMapNode,
	MindMapVariant,
	PocketTag,
	RecordingDetail,
	Summary,
	TranscriptSegment,
} from "../model";
import { ShapeError } from "./errors";
import { asArray, asObject, num, str, type Json, type RawRecording, type RawSegment, type RawSummarization } from "./raw";

/**
 * States that mean Pocket is still working on a recording. Every other state, including
 * `completed` and failures, counts as finished, so a final state Pocket adds later never holds a
 * recording back forever. Provisional until the live probe confirms the state set.
 */
const UNFINISHED_STATES = new Set(["processing", "pending", "queued", "uploading", "uploaded", "transcribing", "summarizing"]);

export function isFinishedState(state: string | null): boolean {
	return state === null || !UNFINISHED_STATES.has(state.toLowerCase());
}

export function mapTag(raw: unknown): PocketTag | null {
	const value = asObject(raw);
	const id = str(value?.id);
	const name = str(value?.name);
	return id && name ? { id, name } : null;
}

/** Maps one listing item. A malformed item throws: dropping it would make it look deleted. */
export function mapListed(raw: unknown): ListedRecording {
	const value = asObject(raw);
	const id = str(value?.id);
	const recordingAt = str(value?.recording_at) ?? str(value?.created_at);
	if (!value || !id || !recordingAt) {
		throw new ShapeError("Pocket returned a recording without an id or date.");
	}
	const state = typeof value.state === "string" ? value.state : null;
	return {
		id,
		title: (typeof value.title === "string" ? value.title : "").trim(),
		recordingAt,
		updatedAt: str(value.updated_at) ?? str(value.created_at) ?? recordingAt,
		durationSeconds: num(value.duration),
		state,
		language: str(value.language),
		folderId: str(value.folder_id),
		tags: asArray(value.tags)
			.map(mapTag)
			.filter((tag): tag is PocketTag => tag !== null),
		isFinished: isFinishedState(state),
	};
}

/** Maps a recording detail. Anything malformed is a ShapeError for this recording only. */
export function mapDetail(raw: unknown, listed: ListedRecording): RecordingDetail {
	const value = asObject(raw);
	if (!value) {
		throw new ShapeError(`Pocket returned a malformed detail for recording ${listed.id}.`);
	}
	if (str(value.id) !== null && value.id !== listed.id) {
		throw new ShapeError(`Pocket returned a different recording than ${listed.id}.`);
	}
	// The detail is fetched after the listing; its own fields are the fresher ones when present.
	const base: ListedRecording = { ...listed, ...pickListedFields(value) };
	const speakerNames = speakerMap(value.speakers);
	const segments = asArray(asObject(value.transcript)?.segments)
		.map((segment) => asObject(segment) as RawSegment | null)
		.filter((segment): segment is RawSegment => segment !== null);
	const transcript = segments.length > 0 ? segments.map((segment) => mapSegment(segment, speakerNames, "original")) : null;
	const summarization = latestSummarization(value.summarizations);
	const v2 = asObject(summarization?.v2);
	const translationInfo = asObject(value.translation);
	const translated = str(translationInfo?.processing_status) === "completed" && segments.some((segment) => str(segment.text) !== null && segment.text !== segment.originalText);

	return {
		...base,
		speakers: uniqueSpeakers(transcript, speakerNames),
		transcript,
		summary: mapSummary(v2?.summary),
		actionItems: mapActionItems(v2?.actionItems),
		mindMaps: mapMindMaps(v2?.mindMap),
		translation: translated ? segments.map((segment) => mapSegment(segment, speakerNames, "translated")) : null,
		translationLanguage: translated ? str(translationInfo?.to_language) : null,
	};
}

function pickListedFields(value: RawRecording): Partial<ListedRecording> {
	const out: Partial<ListedRecording> = {};
	const title = typeof value.title === "string" ? value.title.trim() : null;
	if (title) out.title = title;
	const updatedAt = str(value.updated_at);
	if (updatedAt) out.updatedAt = updatedAt;
	if ("folder_id" in value) out.folderId = str(value.folder_id);
	const language = str(value.language);
	if (language) out.language = language;
	const duration = num(value.duration);
	if (duration !== null) out.durationSeconds = duration;
	if (Array.isArray(value.tags)) {
		out.tags = value.tags.map(mapTag).filter((tag): tag is PocketTag => tag !== null);
	}
	if (typeof value.state === "string") {
		out.state = value.state;
		out.isFinished = isFinishedState(value.state);
	}
	return out;
}

function speakerMap(raw: unknown): Map<string, string> {
	const names = new Map<string, string>();
	for (const [label, entry] of Object.entries(asObject(raw) ?? {})) {
		const name = str(asObject(entry)?.name);
		if (name) names.set(label, name);
	}
	return names;
}

function mapSegment(segment: RawSegment, speakerNames: Map<string, string>, which: "original" | "translated"): TranscriptSegment {
	const label = str(segment.speaker);
	const original = typeof segment.originalText === "string" ? segment.originalText : null;
	const text = typeof segment.text === "string" ? segment.text : "";
	return {
		start: num(segment.start) ?? 0,
		end: num(segment.end) ?? num(segment.start) ?? 0,
		speaker: str(segment.speakerName)?.trim() || (label ? speakerNames.get(label) : undefined) || label || "Speaker",
		text: (which === "original" ? (original ?? text) : text).trim(),
	};
}

function uniqueSpeakers(transcript: TranscriptSegment[] | null, speakerNames: Map<string, string>): string[] {
	const seen = new Set<string>();
	for (const segment of transcript ?? []) seen.add(segment.speaker);
	if (seen.size === 0) for (const name of speakerNames.values()) seen.add(name);
	return [...seen];
}

/** The newest completed summarization, else the newest of any status. */
function latestSummarization(raw: unknown): RawSummarization | null {
	const entries = Object.values(asObject(raw) ?? {})
		.map((entry) => asObject(entry) as RawSummarization | null)
		.filter((entry): entry is RawSummarization => entry !== null)
		.sort((a, b) => stamp(b) - stamp(a));
	return entries.find((entry) => entry.processingStatus === "completed") ?? entries[0] ?? null;
}

function stamp(entry: RawSummarization): number {
	const time = Date.parse(str(entry.updatedAt) ?? str(entry.createdAt) ?? "");
	return Number.isNaN(time) ? 0 : time;
}

function mapSummary(raw: unknown): Summary | null {
	const value = asObject(raw);
	const markdown = str(value?.markdown) ?? str(value?.summary);
	if (!value || !markdown) {
		return null;
	}
	return { title: str(value.title) ?? "", emoji: str(value.emoji), markdown: markdown.trim() };
}

function mapActionItems(raw: unknown): ActionItem[] | null {
	const value = asObject(raw);
	if (!value) {
		return null;
	}
	const items = [...asArray(value.actionItems), ...asArray(value.actions)]
		.map((item) => asObject(item))
		.filter((item): item is Json => item !== null)
		.map((item): ActionItem | null => {
			const id = str(item.id);
			const reminder = asObject(asObject(item.payload)?.reminder);
			const title = str(item.title) ?? str(item.label) ?? str(reminder?.title);
			if (!id || !title) return null;
			return {
				id,
				title: title.trim(),
				completed: item.isCompleted === true || item.is_completed === true,
				dueDate: str(item.dueDate) ?? str(reminder?.dueDateTime),
				status: str(item.status),
				assignee: str(item.assignee),
			};
		})
		.filter((item): item is ActionItem => item !== null);
	return items;
}

/**
 * A mind map is accepted as one node, an array of nodes, or an object whose values are nodes (one
 * variant per key). Every variant present is kept, including unknown ones.
 */
function mapMindMaps(raw: unknown): MindMapVariant[] {
	if (Array.isArray(raw)) {
		const roots = raw.map(mapNode).filter((node): node is MindMapNode => node !== null);
		return roots.length > 0 ? [{ name: "Mind map", roots }] : [];
	}
	const value = asObject(raw);
	if (!value) {
		return [];
	}
	const single = mapNode(value);
	if (single) {
		return [{ name: "Mind map", roots: [single] }];
	}
	return Object.entries(value)
		.map(([name, variant]): MindMapVariant | null => {
			const roots = (Array.isArray(variant) ? variant : [variant]).map(mapNode).filter((node): node is MindMapNode => node !== null);
			return roots.length > 0 ? { name: humanize(name), roots } : null;
		})
		.filter((variant): variant is MindMapVariant => variant !== null);
}

function mapNode(raw: unknown, depth = 0): MindMapNode | null {
	const value = asObject(raw);
	if (!value || depth > 32) {
		return null;
	}
	const title = str(value.title) ?? str(value.label) ?? str(value.text) ?? str(value.name);
	if (!title) {
		return null;
	}
	return {
		title: title.trim(),
		children: asArray(value.children)
			.map((child) => mapNode(child, depth + 1))
			.filter((node): node is MindMapNode => node !== null),
	};
}

function humanize(key: string): string {
	const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}
