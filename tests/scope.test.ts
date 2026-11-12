import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListedRecording } from "../src/model";
import { UNFILED_ID } from "../src/settings/schema";
import { classify, horizonStart, listingStartDate } from "../src/sync/scope";
import { folderTree, ids, listedFixture, listedFixtures } from "./support/fixtures";
import { settingsWith } from "./support/settings";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const tree = folderTree();

function at(daysAgo: number, overrides: Partial<ListedRecording> = {}): ListedRecording {
	return { ...listedFixture(ids.acme), id: `r-${daysAgo}`, recordingAt: new Date(NOW - daysAgo * DAY).toISOString(), ...overrides };
}

const scopeOf = (recordings: ListedRecording[], overrides = {}) => classify(recordings, settingsWith(overrides), tree, NOW).map((s) => s.scope);

test("last 30 days: 30.5 days ago is out of horizon, 29 days ago is in scope", () => {
	assert.deepEqual(scopeOf([at(30.5), at(29)], { horizon: "days", horizonDays: 30 }), ["out-of-horizon", "in-scope"]);
});

test("since a date uses the vault zone's midnight, and the listing asks for two extra days", () => {
	const start = horizonStart(settingsWith({ horizon: "since", horizonSince: "2026-11-01", timeZone: "America/Chicago" }), NOW);
	assert.equal(new Date(start ?? 0).toISOString(), "2026-11-01T05:00:00.000Z");
	assert.equal(listingStartDate(start), "2026-10-30");
	assert.equal(listingStartDate(horizonStart(settingsWith(), NOW)), null);
});

test("including folder A covers its child B and excludes a sibling C", () => {
	const inChild = at(1, { folderId: "fd-acme-0003" });
	const inOther = at(1, { folderId: "fd-health-0005" });
	assert.deepEqual(scopeOf([inChild, inOther], { includeFolderIds: ["fd-clients-0002"] }), ["in-scope", "excluded"]);
});

test("excluding B inside an included A excludes B", () => {
	const inChild = at(1, { folderId: "fd-acme-0003" });
	const inSpace = at(1, { folderId: "sp-work-0001" });
	assert.deepEqual(scopeOf([inChild, inSpace], { includeFolderIds: ["sp-work-0001"], excludeFolderIds: ["fd-acme-0003"] }), ["excluded", "in-scope"]);
});

test("an unfiled recording is excluded under an include filter unless Unfiled is picked", () => {
	const unfiled = at(1, { folderId: null });
	assert.deepEqual(scopeOf([unfiled], { includeFolderIds: ["sp-work-0001"] }), ["excluded"]);
	assert.deepEqual(scopeOf([unfiled], { includeFolderIds: ["sp-work-0001", UNFILED_ID] }), ["in-scope"]);
	assert.deepEqual(scopeOf([unfiled], { excludeFolderIds: [UNFILED_ID] }), ["excluded"]);
});

test("a folder the tree does not know is excluded under an exclude filter", () => {
	assert.deepEqual(scopeOf([at(1, { folderId: "fd-unknown" })], { excludeFolderIds: ["fd-health-0005"] }), ["excluded"]);
});

test("excluding a tag marks the recording excluded rather than dropping it", () => {
	const result = classify([listedFixture(ids.acme)], settingsWith({ excludeTagIds: ["tg-internal-02"] }), tree, NOW);
	assert.equal(result.length, 1);
	assert.equal(result[0]?.scope, "excluded");
	assert.deepEqual(scopeOf([listedFixture(ids.weekly)], { includeTagIds: ["tg-internal-02"] }), ["excluded"]);
});

test("a highlight in an excluded folder stays in scope as an insight", () => {
	const [idea] = classify([listedFixture(ids.idea)], settingsWith({ excludeFolderIds: ["fd-health-0005"] }), tree, NOW);
	assert.equal(idea?.kind, "insight");
	assert.equal(idea?.scope, "in-scope");
});

test("an unfinished state is held; a failed one is in scope", () => {
	assert.deepEqual(scopeOf([listedFixture(ids.processing), listedFixture(ids.doctor)]), ["held", "in-scope"]);
});

test("every listed recording lands in exactly one class", () => {
	const listing = listedFixtures();
	assert.equal(classify(listing, settingsWith({ horizon: "days", horizonDays: 2, excludeTagIds: ["tg-internal-02"] }), tree, NOW).length, listing.length);
});
