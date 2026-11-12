import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDiagnostics, redact } from "../src/diagnostics";
import { emptyReport } from "../src/sync/report";
import { reportHeadline, reportSections } from "../src/ui/reportModal";
import { settingsWith } from "./support/settings";

const KEY = "pk_live_abcdef1234567890";

function diagnostics(overrides: Partial<Parameters<typeof buildDiagnostics>[0]> = {}): string {
	const report = { ...emptyReport(), created: ["Pocket/a.md"], errors: [{ message: `request failed with Bearer ${KEY}` }] };
	return buildDiagnostics({
		pluginVersion: "0.1.0",
		appVersion: "1.15.1",
		platform: "desktop",
		settings: settingsWith({ apiKeySecret: "pocket-key" }),
		structureDraftPending: false,
		device: { autoSync: true, paused: false, failures: 0, lastSync: { at: 0, status: "auth", message: `Pocket rejected ${KEY}` } },
		lastReport: report,
		recentErrors: [`boom ${KEY}`, "key was pk_other_secret_value"],
		secrets: [KEY],
		...overrides,
	});
}

test("the diagnostic report never contains the key, its secret id, or a key-shaped string", () => {
	const text = diagnostics();
	assert.ok(!text.includes(KEY));
	assert.ok(!text.includes("pocket-key"), "the secret id is reduced to set or not set");
	assert.ok(!text.includes("pk_other_secret_value"));
	assert.ok(text.includes("(set)"));
	assert.ok(text.includes("[redacted]"));
});

test("the diagnostic report carries counts, not note names", () => {
	const text = diagnostics();
	assert.ok(text.includes('"created": 1'));
	assert.ok(!text.includes("Pocket/a.md"));
});

test("redaction replaces every occurrence", () => {
	assert.equal(redact(`${KEY} and ${KEY}`, [KEY]), "[redacted] and [redacted]");
});

test("an empty report renders 'nothing changed'", () => {
	assert.equal(reportHeadline(emptyReport()), "Nothing changed.");
	assert.deepEqual(reportSections(emptyReport()), []);
	assert.equal(reportHeadline(null), "No sync has run on this device yet.");
});

test("report sections list each category with its notes", () => {
	const report = { ...emptyReport(), created: ["a.md"], userMoved: ["b.md"], conflicts: [{ path: "c.md", reason: "markers damaged" }], unchanged: 4 };
	const sections = reportSections(report);
	assert.deepEqual(sections.map((s) => s.title), ["Created", "Moved by you (left in place)", "Conflicts (skipped)", "Unchanged"]);
	assert.equal(sections[2]?.items[0]?.detail, "markers damaged");
	assert.equal(reportHeadline(report), "1 created, 1 conflict.");
});
