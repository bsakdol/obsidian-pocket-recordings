import assert from "node:assert/strict";
import { test } from "node:test";

import { PocketClient } from "../src/pocket/api";
import { AuthError, NetworkError, RateLimitBudgetError, ShapeError } from "../src/pocket/errors";
import { RateLimitBudget } from "../src/pocket/rateLimit";
import { ids, listedFixture, rawDetails, rawFolders, rawTags } from "./support/fixtures";
import { fakeClock, fakeTransport, ok, status } from "./support/fakeTransport";

function recordings(count: number, offset = 0): unknown[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `r-${offset + index}`,
		title: `Recording ${offset + index}`,
		recording_at: "2026-11-01T10:00:00.000Z",
		updated_at: "2026-11-01T10:00:00.000Z",
		state: "completed",
		folder_id: null,
		tags: [],
	}));
}

function client(handler: Parameters<typeof fakeTransport>[0], budgetMs = 600_000) {
	const transport = fakeTransport(handler);
	const clock = fakeClock();
	const api = new PocketClient("pk_test", { request: transport.request, sleep: clock.sleep, now: clock.now, budget: new RateLimitBudget(budgetMs) });
	return { api, calls: transport.calls, clock };
}

for (const [total, pages] of [[0, 1], [100, 2], [250, 3]] as const) {
	test(`listing ${total} recordings takes ${pages} requests and keeps order`, async () => {
		const all = recordings(total);
		const { api, calls } = client((_, url) => {
			const page = Number(url.searchParams.get("page"));
			assert.equal(url.searchParams.get("limit"), "100");
			return ok(all.slice((page - 1) * 100, page * 100));
		});
		const listed = await api.listAll(null);
		assert.equal(calls.length, pages);
		assert.deepEqual(listed.map((r) => r.id), all.map((r) => (r as { id: string }).id));
	});
}

test("the listing passes start_date when given", async () => {
	const { api, calls } = client(() => ok([]));
	await api.listAll("2026-10-01");
	assert.equal(calls[0]?.searchParams.get("start_date"), "2026-10-01");
});

test("a page failure mid-listing throws and returns nothing partial", async () => {
	const { api } = client((_, url) => (url.searchParams.get("page") === "2" ? status(404) : ok(recordings(100))));
	await assert.rejects(api.listAll(null), NetworkError);
});

test("a listing page that is not a list is a shape error", async () => {
	const { api } = client(() => ok({ not: "a list" }));
	await assert.rejects(api.listAll(null), ShapeError);
});

test("a 429 with X-RateLimit-Reset in epoch seconds waits until the reset", async () => {
	let first = true;
	const { api, clock } = client(() => {
		if (first) {
			first = false;
			const reset = Math.floor(clock.now() / 1000) + 20;
			return status(429, { "X-RateLimit-Reset": String(reset) });
		}
		return ok([]);
	});
	await api.listAll(null);
	assert.equal(clock.slept.length, 1);
	assert.ok(clock.slept[0]! >= 19_000 && clock.slept[0]! <= 20_000, `waited ${clock.slept[0]}`);
});

test("a wait longer than 60 seconds is capped", async () => {
	let first = true;
	const { api, clock } = client(() => {
		if (first) {
			first = false;
			return status(429, { "Retry-After": "300" });
		}
		return ok([]);
	});
	await api.listAll(null);
	assert.deepEqual(clock.slept, [60_000]);
});

test("the sixth consecutive 429 on one request throws", async () => {
	let count = 0;
	const { api } = client(() => {
		count += 1;
		return status(429, { "Retry-After": "1" });
	});
	await assert.rejects(api.listAll(null), RateLimitBudgetError);
	assert.equal(count, 6);
});

test("exceeding the run budget throws RateLimitBudgetError", async () => {
	let count = 0;
	const { api, clock } = client(() => {
		count += 1;
		return count % 3 === 0 ? ok([]) : status(429, { "Retry-After": "60" });
	}, 150_000);
	await api.listAll(null);
	await assert.rejects(api.listAll(null), RateLimitBudgetError);
	assert.ok(clock.slept.reduce((a, b) => a + b, 0) <= 150_000);
});

test("a mobile budget of 3 minutes is honored", async () => {
	const { api, clock } = client(() => status(429, { "Retry-After": "60" }), 180_000);
	await assert.rejects(api.listAll(null), RateLimitBudgetError);
	await assert.rejects(api.listAll(null), RateLimitBudgetError);
	assert.equal(clock.slept.reduce((a, b) => a + b, 0), 180_000);
});

test("a 401 maps to AuthError", async () => {
	const { api } = client(() => status(401));
	await assert.rejects(api.listAll(null), AuthError);
});

test("a 5xx is retried, then succeeds", async () => {
	let count = 0;
	const { api } = client(() => (++count < 3 ? status(503) : ok([])));
	await api.listAll(null);
	assert.equal(count, 3);
});

test("a network failure is retried, then reported", async () => {
	const { api } = client(() => {
		throw new Error("offline");
	});
	await assert.rejects(api.listAll(null), NetworkError);
});

test("details, folders, and tags map from fixtures", async () => {
	const { api, calls } = client((_, url) => {
		if (url.pathname.endsWith("/public/folders")) return ok(rawFolders.data);
		if (url.pathname.endsWith("/public/tags")) return ok(rawTags.data);
		const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
		return { status: 200, json: rawDetails[id], headers: {} };
	});
	const detail = await api.getDetail(listedFixture(ids.acme));
	assert.equal(detail.summary?.title, "Acme kickoff");
	assert.equal(calls[0]?.searchParams.get("include_transcript"), "true");
	assert.equal((await api.listFolders()).displayPath("fd-acme-0003"), "Work/Clients/Acme: Q4");
	assert.deepEqual((await api.listTags()).map((tag) => tag.name), ["highlights", "internal"]);
});
