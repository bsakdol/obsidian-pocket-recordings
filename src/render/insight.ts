import type { RecordingDetail } from "../model";
import { localParts } from "../paths/time";
import type { Settings } from "../settings/schema";
import { renderActionItems } from "./actionItems";
import { renderConversationRole } from "./conversation";
import { neutralizeMarkers } from "./markers";

/** A per-recording insight note: every enabled section Pocket produced, in the user's order. */
export function renderInsight(detail: RecordingDetail, settings: Settings, ticks: ReadonlySet<string>): string {
	return renderConversationRole({ detail, role: "insight", settings, siblings: {}, ticks });
}

/** The rollup's ordering: by recording time, then id. */
export function sortMembers<T extends { recordingAt: string; id: string }>(members: T[]): T[] {
	return [...members].sort((a, b) => (a.recordingAt < b.recordingAt ? -1 : a.recordingAt > b.recordingAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * A daily rollup: one section per highlight of the day, fully regenerated from every member's
 * details. Action-item ticks carry over by block id like any other note.
 */
export function renderRollup(members: RecordingDetail[], settings: Settings, ticks: ReadonlySet<string>): string {
	return sortMembers(members)
		.map((member) => {
			const { hour, minute } = localParts(member.recordingAt, settings.timeZone);
			const title = neutralizeMarkers(member.title.replace(/\s+/g, " ").trim() || member.id);
			const blocks = [`## ${hour}:${minute} · ${title}`];
			if (settings.outputSummary && member.summary) blocks.push(neutralizeMarkers(member.summary.markdown));
			else if (settings.outputTranscript && member.transcript) blocks.push(neutralizeMarkers(member.transcript.map((segment) => segment.text).join(" ")));
			if (settings.outputActionItems && member.actionItems && member.actionItems.length > 0) {
				const items = renderActionItems(member.actionItems, settings, ticks);
				if (items) blocks.push(items);
			}
			return blocks.join("\n\n");
		})
		.join("\n\n");
}
