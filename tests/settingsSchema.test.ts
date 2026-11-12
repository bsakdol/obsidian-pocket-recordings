import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_SETTINGS, effectiveSettings, hasStructureDraft, pickStructure, sanitizeData, sanitizeSettings, SCHEMA_VERSION } from "../src/settings/schema";

test("empty data yields the documented defaults", () => {
	const data = sanitizeData(undefined);
	const s = data.settings;
	assert.equal(data.schemaVersion, SCHEMA_VERSION);
	assert.equal(data.confirmedStructure, null);
	assert.equal(s.horizon, "all");
	assert.deepEqual([s.outputSummary, s.outputActionItems, s.outputMindMaps, s.outputTranscript, s.outputTranslation], [true, true, true, true, true]);
	assert.equal(s.scheme, "pocket-folders");
	assert.equal(s.granularity, "YYYY-MM-DD");
	assert.equal(s.layout, "main-transcript");
	assert.equal(s.intervalMinutes, 60);
	assert.equal(s.insightsTag, "highlights");
	assert.equal(s.insightShape, "per-recording");
	assert.deepEqual(s, { ...DEFAULT_SETTINGS, sectionOrder: [...DEFAULT_SETTINGS.sectionOrder] });
});

test("an out-of-range stored interval is coerced into 5–1440", () => {
	assert.equal(sanitizeSettings({ intervalMinutes: 2 }).intervalMinutes, 5);
	assert.equal(sanitizeSettings({ intervalMinutes: 5000 }).intervalMinutes, 1440);
	assert.equal(sanitizeSettings({ intervalMinutes: "15" }).intervalMinutes, 60);
});

test("an unknown enum value falls back to its default", () => {
	const s = sanitizeSettings({ layout: "mirror", scheme: "flat", granularity: "YYYY", insightShape: 3 });
	assert.equal(s.layout, "main-transcript");
	assert.equal(s.scheme, "pocket-folders");
	assert.equal(s.granularity, "YYYY-MM-DD");
	assert.equal(s.insightShape, "per-recording");
});

test("data with a future schemaVersion still loads its known fields", () => {
	const data = sanitizeData({ schemaVersion: 99, settings: { layout: "single", someFutureField: true }, confirmedStructure: { layout: "single" } });
	assert.equal(data.settings.layout, "single");
	assert.equal(data.confirmedStructure?.layout, "single");
	assert.ok(!("someFutureField" in data.settings));
});

test("invalid stored values are repaired", () => {
	const s = sanitizeSettings({ timeZone: "Mars/Base", baseFolder: "/Notes//Pocket/", templateMain: "  ", sectionOrder: ["transcript", "bogus", "transcript"], includeFolderIds: ["a", 3, "a"] });
	assert.equal(s.timeZone, "");
	assert.equal(s.baseFolder, "Notes/Pocket");
	assert.equal(s.templateMain, DEFAULT_SETTINGS.templateMain);
	assert.deepEqual(s.sectionOrder, ["transcript", "summary", "action-items", "mind-map", "translation"]);
	assert.deepEqual(s.includeFolderIds, ["a"]);
});

test("sync runs with the confirmed structure while a draft is pending", () => {
	const confirmed = pickStructure(sanitizeSettings({ layout: "main-transcript" }));
	const data = sanitizeData({ settings: { layout: "single", transcriptTimestamps: false }, confirmedStructure: confirmed });
	assert.equal(hasStructureDraft(data), true);
	const effective = effectiveSettings(data);
	assert.equal(effective.layout, "main-transcript");
	assert.equal(effective.transcriptTimestamps, false);
});
