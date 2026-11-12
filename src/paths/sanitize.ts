// Turns arbitrary text (titles, Pocket folder names, rendered templates) into one safe path segment.

/** Characters invalid in file names on some platform, plus those that break Obsidian links. */
const INVALID_RUN = /[\\/:*?"<>|#[\]^]+/g;
const WINDOWS_DEVICE_NAME = /^(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])$/i;
export const MAX_SEGMENT_LENGTH = 100;

/**
 * A run of invalid characters between two other characters becomes a dash, so `1:1` reads `1-1`
 * and `a/b` reads `a-b`; next to a space or at either end it is dropped, so `Acme: Q4` reads
 * `Acme Q4` rather than `Acme- Q4`.
 */
function replaceInvalid(text: string): string {
	return text.replace(INVALID_RUN, (run: string, offset: number) => {
		const before = text[offset - 1];
		const after = text[offset + run.length];
		return before !== undefined && after !== undefined && !/\s/.test(before) && !/\s/.test(after) ? "-" : " ";
	});
}

/**
 * The text made safe as one path segment, or an empty string when nothing usable is left:
 * invalid characters become dashes inside a word and disappear elsewhere, control characters become
 * spaces, runs of whitespace collapse, leading dots go (Obsidian ignores dot folders), trailing dots
 * and spaces go (Windows and iCloud reject them), Windows device names get an underscore, and the
 * result is capped without splitting a surrogate pair.
 */
export function sanitizeSegment(text: string): string {
	const visible = Array.from(text.normalize("NFC"), (char) => (isControl(char) ? " " : char)).join("");
	const cleaned = replaceInvalid(visible)
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[. ]+/, "");
	const capped = stripTrailing(cut(cleaned, MAX_SEGMENT_LENGTH));
	const dot = capped.indexOf(".");
	const base = (dot === -1 ? capped : capped.slice(0, dot)).trimEnd();
	return WINDOWS_DEVICE_NAME.test(base) ? stripTrailing(cut(`${base}_${capped.slice(base.length)}`, MAX_SEGMENT_LENGTH)) : capped;
}

/** Like `sanitizeSegment`, but never empty: an unusable result becomes `fallback`. */
export function safeSegment(text: string, fallback: string): string {
	return sanitizeSegment(text) || sanitizeSegment(fallback) || "Untitled";
}

function isControl(char: string): boolean {
	const code = char.charCodeAt(0);
	return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function stripTrailing(text: string): string {
	return text.replace(/[. ]+$/, "");
}

/** The first `max` UTF-16 units, one fewer when the cut would split a surrogate pair. */
function cut(text: string, max: number): string {
	if (text.length <= max) return text;
	const head = text.slice(0, max);
	const last = head.charCodeAt(head.length - 1);
	return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head;
}
