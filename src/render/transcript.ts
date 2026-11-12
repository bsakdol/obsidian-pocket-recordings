import type { TranscriptSegment } from "../model";
import { neutralizeMarkers } from "./markers";

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatTimestamp(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** One paragraph per segment, led by the speaker and, when enabled, the timestamp. */
export function renderTranscript(segments: TranscriptSegment[], timestamps: boolean): string {
	return segments
		.filter((segment) => segment.text.length > 0)
		.map((segment) => {
			const lead = timestamps ? `**[${formatTimestamp(segment.start)}] ${segment.speaker}:**` : `**${segment.speaker}:**`;
			return `${lead} ${neutralizeMarkers(segment.text.replace(/\s+/g, " "))}`;
		})
		.join("\n\n");
}
