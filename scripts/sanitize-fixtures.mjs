// Turns raw probe captures into committable test fixtures.
//
//   node scripts/sanitize-fixtures.mjs [--from .probe] [--to tests/fixtures/pocket] [--keep highlights,work]
//
// Every key, id (including raw speaker labels, which key the speakers map), enum-like state,
// number, boolean, and ISO timestamp is kept, so the fixtures keep the payload's real shape. Every other string has each run of letters and digits replaced by
// placeholder text of the same length, so markdown structure (headings, bullets, punctuation)
// survives while no original word does. `--keep` lists exact values (such as an insights tag name)
// that tests depend on and are safe to commit.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ID_KEY = /(^id$|_id$|Id$|^speaker$)/;
const ENUM_KEYS = new Set([
	"state",
	"kind",
	"status",
	"processingStatus",
	"processing_status",
	"type",
	"language",
	"detected_language",
	"to_language",
	"color",
	"priority",
	"error_code",
]);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");

function placeholderRun(length, seed) {
	let out = "";
	let index = seed;
	while (out.length < length) {
		out += WORDS[index % WORDS.length];
		index += 1;
	}
	return out.slice(0, length);
}

/** Replaces every letter/digit run in `text` with placeholder text of the same length. */
export function scrubText(text) {
	let seed = 0;
	return text.replace(/[\p{L}\p{N}]+/gu, (run) => placeholderRun(run.length, seed++));
}

/** Sanitizes one parsed JSON value. `keep` is a set of exact string values left untouched. */
export function sanitize(value, keep = new Set(), key = "") {
	if (Array.isArray(value)) return value.map((item) => sanitize(item, keep, key));
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, sanitize(child, keep, name)]));
	}
	if (typeof value !== "string") return value;
	if (keep.has(value) || ISO_TIMESTAMP.test(value) || ENUM_KEYS.has(key) || ID_KEY.test(key)) return value;
	return scrubText(value);
}

function filesUnder(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? filesUnder(full) : name.endsWith(".json") ? [full] : [];
	});
}

function main() {
	const args = process.argv.slice(2);
	const option = (name, fallback) => {
		const index = args.indexOf(name);
		return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
	};
	const from = option("--from", ".probe");
	const to = option("--to", "tests/fixtures/pocket");
	const keep = new Set(option("--keep", "highlights").split(",").filter(Boolean));
	mkdirSync(to, { recursive: true });
	for (const file of filesUnder(from)) {
		if (/findings/.test(basename(file))) continue;
		const raw = JSON.parse(readFileSync(file, "utf8"));
		const name = file.slice(from.length + 1).replace(/[\\/]/g, "-");
		writeFileSync(join(to, name), JSON.stringify(sanitize(raw, keep), null, 2) + "\n");
		console.log(`${file} -> ${join(to, name)}`);
	}
}

// Run only as the CLI; a test bundle that inlines this module has a different entry file.
if (process.argv[1] && basename(process.argv[1]) === "sanitize-fixtures.mjs" && fileURLToPath(import.meta.url) === process.argv[1]) {
	main();
}
