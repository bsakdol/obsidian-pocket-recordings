import assert from "node:assert/strict";
import { test } from "node:test";

import { Scheduler, type IntervalClock } from "../src/runtime/scheduler";
import { noticeFor, statusText } from "../src/runtime/statusBar";
import { emptyReport } from "../src/sync/report";

function fakeClock(): IntervalClock & { active: Map<number, number>; fire(): void } {
	const active = new Map<number, number>();
	const callbacks = new Map<number, () => void>();
	let next = 1;
	return {
		active,
		setInterval: (callback, ms) => {
			const id = next++;
			active.set(id, ms);
			callbacks.set(id, callback);
			return id;
		},
		clearInterval: (id) => {
			active.delete(id);
			callbacks.delete(id);
		},
		fire: () => {
			for (const callback of callbacks.values()) callback();
		},
	};
}

test("the scheduler ticks on start and then on its interval", () => {
	const clock = fakeClock();
	let ticks = 0;
	const scheduler = new Scheduler(clock, () => void ticks++);
	scheduler.start(60);
	assert.equal(ticks, 1);
	assert.deepEqual([...clock.active.values()], [3_600_000]);
	clock.fire();
	assert.equal(ticks, 2);
});

test("an interval change re-arms the timer without stacking intervals", () => {
	const clock = fakeClock();
	let ticks = 0;
	const scheduler = new Scheduler(clock, () => void ticks++);
	scheduler.start(60);
	scheduler.reschedule(15);
	scheduler.reschedule(5);
	assert.deepEqual([...clock.active.values()], [300_000]);
	assert.equal(ticks, 1, "re-arming does not tick");
	scheduler.stop();
	assert.equal(clock.active.size, 0);
	scheduler.reschedule(10);
	assert.equal(clock.active.size, 0, "a stopped scheduler stays stopped");
});

const ok = { status: "ok" as const, report: emptyReport(), message: null };
const failed = { status: "aborted" as const, report: emptyReport(), message: "Could not reach Pocket." };

test("a scheduled success raises no notice; a scheduled failure raises one", () => {
	assert.equal(noticeFor(ok, false, false), null);
	assert.match(noticeFor(failed, false, false) ?? "", /Could not reach Pocket/);
	assert.match(noticeFor(failed, false, true) ?? "", /paused/);
});

test("manual runs always raise a notice", () => {
	assert.equal(noticeFor(ok, true, false), "Pocket sync: Nothing changed");
});

test("the status bar shows running, paused, last sync, and errors", () => {
	assert.equal(statusText({ running: true, paused: false, autoSync: true, last: null }), "Pocket: syncing…");
	assert.equal(statusText({ running: false, paused: true, autoSync: true, last: null }), "Pocket: auto-sync paused");
	assert.match(statusText({ running: false, paused: false, autoSync: true, last: { at: Date.now(), status: "ok", message: null } }), /^Pocket: synced \d\d:\d\d$/);
	assert.match(statusText({ running: false, paused: false, autoSync: true, last: { at: Date.now(), status: "auth", message: "x" } }), /failed/);
});
