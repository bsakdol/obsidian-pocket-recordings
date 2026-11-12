import type { RecordingDetail } from "../model";
import type { Role, Section, Settings } from "../settings/schema";
import { renderActionItems } from "./actionItems";
import { neutralizeMarkers } from "./markers";
import { renderMindMaps } from "./mindMap";
import { renderTranscript } from "./transcript";

export const ROLE_LABELS: Record<Role, string> = {
	main: "Main note",
	single: "Recording",
	transcript: "Transcript",
	summary: "Summary",
	"action-items": "Action items",
	"mind-map": "Mind map",
	translation: "Translation",
	insight: "Insight",
	rollup: "Highlights",
};

export interface RenderInput {
	detail: RecordingDetail;
	role: Role;
	settings: Settings;
	/** Current paths of the recording's other notes, linked from this one. */
	siblings: Partial<Record<Role, string>>;
	/** Block ids ticked in this note's previous region. */
	ticks: ReadonlySet<string>;
}

const SECTION_ROLE: Record<Section, Role> = {
	summary: "summary",
	"action-items": "action-items",
	"mind-map": "mind-map",
	transcript: "transcript",
	translation: "translation",
};

function enabled(section: Section, settings: Settings): boolean {
	switch (section) {
		case "summary":
			return settings.outputSummary;
		case "action-items":
			return settings.outputActionItems;
		case "mind-map":
			return settings.outputMindMaps;
		case "transcript":
			return settings.outputTranscript;
		case "translation":
			return settings.outputTranslation;
	}
}

/** A section's heading and body, or null when Pocket produced nothing for it. */
export function renderSection(section: Section, input: Pick<RenderInput, "detail" | "settings" | "ticks">): string | null {
	const { detail, settings, ticks } = input;
	switch (section) {
		case "summary":
			return detail.summary ? `## Summary\n\n${neutralizeMarkers(detail.summary.markdown)}` : null;
		case "action-items": {
			if (!detail.actionItems || detail.actionItems.length === 0) return null;
			const body = renderActionItems(detail.actionItems, settings, ticks);
			return body ? `## Action items\n\n${body}` : "## Action items";
		}
		case "mind-map":
			return detail.mindMaps.length > 0 ? `## Mind map\n\n${renderMindMaps(detail.mindMaps, 3)}` : null;
		case "transcript":
			return detail.transcript ? `## Transcript\n\n${renderTranscript(detail.transcript, settings.transcriptTimestamps)}` : null;
		case "translation":
			return detail.translation
				? `## Translation${detail.translationLanguage ? ` (${detail.translationLanguage})` : ""}\n\n${renderTranscript(detail.translation, settings.transcriptTimestamps)}`
				: null;
	}
}

/** The sections a role's note holds, in the user's order. */
function sectionsFor(role: Role, settings: Settings): Section[] {
	const order = settings.sectionOrder.filter((section) => enabled(section, settings));
	switch (role) {
		case "single":
		case "insight":
			return order;
		case "main":
			// Main plus transcript keeps the bulky transcript in its own note when that note exists.
			return settings.layout === "main-transcript" && settings.outputTranscript ? order.filter((s) => s !== "transcript") : order;
		default: {
			const own = (Object.keys(SECTION_ROLE) as Section[]).find((section) => SECTION_ROLE[section] === role);
			return own ? [own] : [];
		}
	}
}

export function linksLine(role: Role, siblings: Partial<Record<Role, string>>): string | null {
	const links = (Object.entries(siblings) as [Role, string][])
		.filter(([other]) => other !== role)
		.map(([other, path]) => `[[${path.replace(/\.md$/, "")}|${ROLE_LABELS[other]}]]`);
	return links.length > 0 ? `Related: ${links.join(" · ")}` : null;
}

export function tagsLine(detail: RecordingDetail, settings: Settings): string | null {
	if (!settings.inlineTags || detail.tags.length === 0) return null;
	const tags = detail.tags.map((tag) => `#pocket/${tag.name.toLowerCase().replace(/[^\p{L}\p{N}/_-]+/gu, "-").replace(/^-+|-+$/g, "")}`).filter((tag) => tag !== "#pocket/");
	return tags.length > 0 ? tags.join(" ") : null;
}

/** The body of a conversation note's region for one role. Pure and deterministic. */
export function renderConversationRole(input: RenderInput): string {
	const { detail, role, settings } = input;
	const blocks: string[] = [];
	const links = linksLine(role, input.siblings);
	if (links) blocks.push(links);
	const tags = tagsLine(detail, settings);
	if (tags) blocks.push(tags);
	const rendered = sectionsFor(role, settings)
		.map((section) => renderSection(section, input))
		.filter((block): block is string => block !== null);
	if (rendered.length === 0) {
		blocks.push(`_Pocket has no ${ROLE_LABELS[role].toLowerCase()} for this recording yet._`);
	}
	return [...blocks, ...rendered].join("\n\n");
}
