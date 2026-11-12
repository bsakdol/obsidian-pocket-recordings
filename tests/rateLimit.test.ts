import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimitBudgetError } from "../src/pocket/errors";
import { RateLimitBudget, waitForRateLimit } from "../src/pocket/rateLimit";

const NOW = Date.parse("2026-11-11T12:00:00Z");

test("Retry-After seconds win over X-RateLimit-Reset", () => {
	assert.equal(waitForRateLimit({ "retry-after": "7", "X-RateLimit-Reset": String(NOW / 1000 + 30) }, NOW, 0), 7000);
});

test("Retry-After as an HTTP date", () => {
	assert.equal(waitForRateLimit({ "Retry-After": new Date(NOW + 12_000).toUTCString() }, NOW, 0), 12_000);
});

test("X-RateLimit-Reset is read as epoch seconds", () => {
	assert.equal(waitForRateLimit({ "X-RateLimit-Reset": String(NOW / 1000 + 30) }, NOW, 0), 30_000);
});

test("without a hint the wait backs off exponentially and caps at 60 seconds", () => {
	assert.deepEqual([0, 1, 2, 3, 10].map((n) => waitForRateLimit({}, NOW, n)), [1000, 2000, 4000, 8000, 60_000]);
});

test("a wait is never less than a second", () => {
	assert.equal(waitForRateLimit({ "Retry-After": "0" }, NOW, 0), 1000);
});

test("the run budget refuses a wait it cannot afford", () => {
	const budget = new RateLimitBudget(10_000);
	budget.spend(6000);
	assert.throws(() => budget.spend(5000), RateLimitBudgetError);
	assert.equal(budget.remainingMs, 0);
});
