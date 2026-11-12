// Dev-only probe of the live Pocket API. Never bundled into the plugin.
//
//   POCKET_API_KEY=pk_... node scripts/probe-pocket.mjs [--details N] [--ids a,b,c]
//   POCKET_API_KEY=pk_... node scripts/probe-pocket.mjs --compare
//
// Capture mode writes raw responses to .probe/ (gitignored) and prints findings that answer the
// plan's open questions. Compare mode re-fetches the captured details after a summary was
// regenerated in the Pocket app and reports whether action-item ids and `updated_at` moved.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const BASE = "https://public.heypocketai.com/api/v1";
const OUT = ".probe";
const key = process.env.POCKET_API_KEY?.trim();
if (!key) {
	console.error("Set POCKET_API_KEY in the environment.");
	process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
	const index = args.indexOf(name);
	return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rateHeaders = [];

async function get(path, query = {}) {
	const url = new URL(BASE + path);
	for (const [name, value] of Object.entries(query)) {
		if (value !== undefined) url.searchParams.set(name, String(value));
	}
	for (let attempt = 0; attempt < 6; attempt++) {
		const response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
		const headers = Object.fromEntries([...response.headers].filter(([name]) => /ratelimit|retry-after/i.test(name)));
		rateHeaders.push({ path, status: response.status, headers });
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get("retry-after"));
			const reset = Number(response.headers.get("x-ratelimit-reset"));
			const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
				? retryAfter * 1000
				: Number.isFinite(reset) && reset > 0 ? Math.max(1000, reset * 1000 - Date.now() + 1000) : 5000;
			console.error(`429 on ${path}; waiting ${Math.round(waitMs / 1000)}s`);
			await sleep(Math.min(waitMs, 60000));
			continue;
		}
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(`${response.status} on ${path}: ${body?.error ?? "no error message"}`);
		}
		await sleep(250);
		return body;
	}
	throw new Error(`Gave up on ${path} after repeated 429s.`);
}

function save(name, value) {
	const file = join(OUT, name);
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

async function listAll(query = {}) {
	const pages = [];
	for (let page = 1; ; page++) {
		const body = await get("/public/recordings", { ...query, page, limit: 100 });
		pages.push(body);
		if (!Array.isArray(body.data) || body.data.length < 100) break;
	}
	return pages;
}

const utcDay = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : null);

function summarizationsOf(detail) {
	const value = detail?.summarizations;
	return value && typeof value === "object" ? Object.entries(value) : [];
}

function actionItemIds(detail) {
	const ids = [];
	for (const [, summary] of summarizationsOf(detail)) {
		const root = summary?.v2?.actionItems ?? {};
		for (const item of [...(root.actionItems ?? []), ...(root.actions ?? [])]) {
			if (item?.id) ids.push(String(item.id));
		}
	}
	return ids.sort();
}

function describeDetail(detail) {
	const summaries = summarizationsOf(detail);
	const v2Keys = new Set();
	const mindMapShapes = new Set();
	for (const [, summary] of summaries) {
		for (const name of Object.keys(summary?.v2 ?? {})) v2Keys.add(name);
		const mindMap = summary?.v2?.mindMap;
		if (mindMap && typeof mindMap === "object") mindMapShapes.add(Array.isArray(mindMap) ? "array" : Object.keys(mindMap).join("|"));
	}
	const segments = detail?.transcript?.segments ?? [];
	return {
		id: detail?.id,
		state: detail?.state,
		topLevelKeys: Object.keys(detail ?? {}).sort(),
		summarizationCount: summaries.length,
		summarizationStatuses: summaries.map(([, s]) => s?.processingStatus ?? s?.processing_status ?? null),
		summarizationKeys: [...new Set(summaries.flatMap(([, s]) => Object.keys(s ?? {})))].sort(),
		v2Keys: [...v2Keys].sort(),
		mindMapShapes: [...mindMapShapes],
		actionItemIdSamples: actionItemIds(detail).slice(0, 3),
		segmentKeys: [...new Set(segments.flatMap((s) => Object.keys(s ?? {})))].sort(),
		segmentsWithSpeakerName: segments.filter((s) => typeof s?.speakerName === "string" && s.speakerName.length > 0).length,
		segmentCount: segments.length,
		translation: detail?.translation ?? null,
		summarizationsErrors: detail?.summarizations_errors ?? null,
		tags: (detail?.tags ?? []).map((tag) => tag?.name),
	};
}

async function capture() {
	mkdirSync(OUT, { recursive: true });
	const folders = await get("/public/folders");
	save("folders.json", folders);
	const tags = await get("/public/tags");
	save("tags.json", tags);
	const pages = await listAll();
	pages.forEach((page, index) => save(`listing-page-${index + 1}.json`, page));
	const listing = pages.flatMap((page) => page.data ?? []);

	// Pick details: explicit ids, else the newest N, plus every non-"completed" state and a highlight.
	const explicit = option("--ids", "").split(",").filter(Boolean);
	const count = Number(option("--details", "6"));
	const picked = new Set(explicit);
	if (picked.size === 0) {
		for (const item of listing.slice(0, count)) picked.add(item.id);
		const byState = new Map();
		for (const item of listing) if (!byState.has(item.state)) byState.set(item.state, item.id);
		for (const id of byState.values()) picked.add(id);
		const highlight = listing.find((item) => (item.tags ?? []).some((tag) => /highlight/i.test(tag?.name ?? "")));
		if (highlight) picked.add(highlight.id);
	}
	const details = [];
	for (const id of picked) {
		const body = await get(`/public/recordings/${encodeURIComponent(id)}`, { include_transcript: true, include_summarizations: true });
		save(`details/${id}.json`, body);
		details.push(body.data);
	}

	// Which timestamp does start_date/end_date filter on? Probe days where the fields disagree.
	const dateProbe = [];
	const candidates = listing.filter((item) => utcDay(item.recording_at) !== utcDay(item.created_at) || utcDay(item.recording_at) !== utcDay(item.updated_at));
	for (const item of candidates.slice(0, 3)) {
		const day = utcDay(item.recording_at);
		const filtered = (await listAll({ start_date: day, end_date: day })).flatMap((page) => page.data ?? []);
		const returned = new Set(filtered.map((r) => r.id));
		const agree = (field) => listing.every((r) => (utcDay(r[field]) === day) === returned.has(r.id));
		dateProbe.push({ day, recordingAt: agree("recording_at"), createdAt: agree("created_at"), updatedAt: agree("updated_at"), returned: returned.size });
	}

	const findings = {
		capturedAt: new Date().toISOString(),
		listingCount: listing.length,
		listingKeys: [...new Set(listing.flatMap((item) => Object.keys(item)))].sort(),
		states: Object.fromEntries([...new Set(listing.map((item) => item.state))].map((s) => [s, listing.filter((i) => i.state === s).length])),
		folderKinds: [...new Set(flattenFolders(folders.data ?? []).map((node) => node.kind))],
		tagKeys: [...new Set((tags.data ?? []).flatMap((tag) => Object.keys(tag ?? {})))].sort(),
		details: details.map(describeDetail),
		dateFilter: dateProbe.length > 0 ? dateProbe : "no recording whose recording_at day differs from created_at/updated_at; not determinable from this account",
		rateLimitHeaders: [...new Set(rateHeaders.flatMap((entry) => Object.keys(entry.headers)))],
	};
	save("findings.json", findings);
	console.log(JSON.stringify(findings, null, 2));
}

function flattenFolders(nodes) {
	return nodes.flatMap((node) => [node, ...flattenFolders(node.children ?? [])]);
}

async function compare() {
	const dir = join(OUT, "details");
	if (!existsSync(dir)) {
		console.error("Run capture mode first.");
		process.exit(1);
	}
	const before = new Map(readdirSync(dir).map((name) => {
		const body = JSON.parse(readFileSync(join(dir, name), "utf8"));
		return [body.data.id, body.data];
	}));
	const listing = (await listAll()).flatMap((page) => page.data ?? []);
	const oldListing = readdirSync(OUT).filter((n) => n.startsWith("listing-page-")).flatMap((n) => JSON.parse(readFileSync(join(OUT, n), "utf8")).data ?? []);
	const results = [];
	for (const [id, old] of before) {
		const body = await get(`/public/recordings/${encodeURIComponent(id)}`, { include_transcript: true, include_summarizations: true });
		save(`compare/${id}.json`, body);
		const fresh = body.data;
		const oldIds = actionItemIds(old);
		const newIds = actionItemIds(fresh);
		const summaryStamp = (d) => summarizationsOf(d).map(([k, s]) => `${k}@${s?.updatedAt ?? s?.updated_at ?? ""}`).sort().join(",");
		results.push({
			id,
			summarizationChanged: summaryStamp(old) !== summaryStamp(fresh),
			detailUpdatedAtChanged: old.updated_at !== fresh.updated_at,
			listingUpdatedAtChanged: (oldListing.find((r) => r.id === id)?.updated_at ?? null) !== (listing.find((r) => r.id === id)?.updated_at ?? null),
			actionItemIdsBefore: oldIds.length,
			actionItemIdsAfter: newIds.length,
			actionItemIdsKept: newIds.filter((x) => oldIds.includes(x)).length,
		});
	}
	save("compare-findings.json", results);
	console.log(JSON.stringify(results, null, 2));
	console.log("For each recording whose summary you regenerated: summarizationChanged should be true; check listingUpdatedAtChanged and actionItemIdsKept.");
}

await (flag("--compare") ? compare() : capture());
