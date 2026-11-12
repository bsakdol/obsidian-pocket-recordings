import type { HttpResponse } from "../../src/pocket/transport";
import { rawDetails, rawFolders, rawListing } from "./fixtures";
import { fakeTransport, ok, status } from "./fakeTransport";

type RawItem = (typeof rawListing.data)[number];

export interface FakePocketOptions {
	listing?: RawItem[];
	foldersFail?: boolean;
	listingFail?: boolean;
	/** Per-recording detail responses that override the default. */
	detailResponse?: (id: string) => HttpResponse | undefined;
	/** Yield to the event loop before answering, so concurrent runs interleave. */
	yieldEachRequest?: boolean;
}

/** The raw detail Pocket would send: the captured fixture, else a synthetic one, with the listing's fields. */
export function rawDetailFor(item: RawItem): unknown {
	const captured = (rawDetails[item.id] as { data?: Record<string, unknown> } | undefined)?.data;
	const base = captured ?? {
		transcript: { segments: [{ start: 0, end: 2, speaker: "S1", speakerName: "Ana", text: `Transcript of ${item.title}` }] },
		summarizations: { s: { processingStatus: "completed", v2: { summary: { markdown: `Summary of ${item.title}` } } } },
	};
	return { ...base, ...item };
}

/** A fake Pocket API over the fixtures. */
export function fakePocket(options: FakePocketOptions = {}) {
	const listing = options.listing ?? rawListing.data;
	return fakeTransport(async (_, url) => {
		if (options.yieldEachRequest) await new Promise((resolve) => setImmediate(resolve));
		const path = url.pathname.replace(/^\/api\/v1/, "");
		if (path === "/public/folders") return options.foldersFail ? status(503) : ok(rawFolders.data);
		if (path === "/public/recordings") {
			if (options.listingFail) return status(500);
			const page = Number(url.searchParams.get("page") ?? "1");
			return ok(listing.slice((page - 1) * 100, page * 100));
		}
		const id = decodeURIComponent(path.replace("/public/recordings/", ""));
		const override = options.detailResponse?.(id);
		if (override) return override;
		const item = listing.find((entry) => entry.id === id);
		return item ? ok(rawDetailFor(item)) : status(404);
	});
}
