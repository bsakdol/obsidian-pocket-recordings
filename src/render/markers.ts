// The plugin-owned region of a note. Everything outside it belongs to the user.

export const BEGIN_MARKER = "%% pocket-recordings:begin %%";
export const END_MARKER = "%% pocket-recordings:end %%";
const MARKER_PREFIX = "%% pocket-recordings:";

export type ParsedNote =
	| { kind: "ok"; before: string; region: string; after: string }
	| { kind: "damaged"; reason: string };

interface Line {
	text: string;
	start: number;
	end: number;
}

function linesOf(content: string): Line[] {
	const lines: Line[] = [];
	let start = 0;
	for (;;) {
		const newline = content.indexOf("\n", start);
		const end = newline === -1 ? content.length : newline;
		lines.push({ text: content.slice(start, end).replace(/\r$/, ""), start, end });
		if (newline === -1) return lines;
		start = newline + 1;
	}
}

function count(content: string, needle: string): number {
	let found = 0;
	for (let index = content.indexOf(needle); index !== -1; index = content.indexOf(needle, index + needle.length)) found += 1;
	return found;
}

/**
 * Splits a note into the text before the region, the region's body, and the text after it. Any
 * shape other than exactly one begin marker line followed by one end marker line, both outside
 * code fences, is damaged: the note is skipped and reported.
 */
export function parseNote(content: string): ParsedNote {
	if (count(content, BEGIN_MARKER) !== 1 || count(content, END_MARKER) !== 1) {
		return { kind: "damaged", reason: "the note does not have exactly one pair of region markers" };
	}
	let fence: string | null = null;
	let begin: Line | null = null;
	let end: Line | null = null;
	for (const line of linesOf(content)) {
		const trimmed = line.text.trim();
		const opener = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
		if (fence) {
			if (opener && opener[0] === fence[0] && opener.length >= fence.length && trimmed === opener) fence = null;
			if (trimmed.includes(MARKER_PREFIX)) return { kind: "damaged", reason: "a region marker is inside a code block" };
			continue;
		}
		if (opener) {
			fence = opener;
			continue;
		}
		if (trimmed === BEGIN_MARKER) begin = line;
		else if (trimmed === END_MARKER) {
			if (!begin) return { kind: "damaged", reason: "the end marker comes before the begin marker" };
			end = line;
		}
	}
	if (!begin || !end) {
		return { kind: "damaged", reason: "a region marker is not on a line of its own" };
	}
	const bodyStart = Math.min(begin.end + 1, end.start);
	const bodyEnd = Math.max(bodyStart, end.start - 1);
	return { kind: "ok", before: content.slice(0, begin.start), region: content.slice(bodyStart, bodyEnd), after: content.slice(end.end) };
}

export function regionBlock(body: string): string {
	return `${BEGIN_MARKER}\n${body}\n${END_MARKER}`;
}

/** A new note: its properties as YAML front matter, then the region (identity from the first byte). */
export function composeNote(frontmatterYaml: string, body: string): string {
	const yaml = frontmatterYaml.endsWith("\n") ? frontmatterYaml : `${frontmatterYaml}\n`;
	return `---\n${yaml}---\n${regionBlock(body)}\n`;
}

/** Replaces the region of a parsed note, keeping the user's text before and after byte for byte. */
export function spliceRegion(parsed: Extract<ParsedNote, { kind: "ok" }>, body: string): string {
	return `${parsed.before}${regionBlock(body)}${parsed.after}`;
}

/** Pocket text can never forge or break the plugin's markers. */
export function neutralizeMarkers(text: string): string {
	return text.split(MARKER_PREFIX).join("%% pocket-recordings :");
}
