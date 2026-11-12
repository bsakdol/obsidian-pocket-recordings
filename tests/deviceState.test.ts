import assert from "node:assert/strict";
import { test } from "node:test";

import { DeviceState, KEY_PREFIX, type LocalStore } from "../src/runtime/deviceState";

function memoryStore(): LocalStore & { data: Map<string, unknown> } {
	const data = new Map<string, unknown>();
	return { data, load: (key) => data.get(key) ?? null, save: (key, value) => void data.set(key, value) };
}

test("a fresh device has auto-sync on for desktop and off for mobile", () => {
	assert.equal(new DeviceState(memoryStore(), false).autoSync, true);
	assert.equal(new DeviceState(memoryStore(), true).autoSync, false);
});

test("the switch is stored under the plugin's prefix on this device only", () => {
	const store = memoryStore();
	new DeviceState(store, true).setAutoSync(true);
	assert.equal(store.data.get(`${KEY_PREFIX}auto-sync`), true);
	assert.equal(new DeviceState(store, true).autoSync, true);
});

test("three aborted runs pause the device, and a successful manual sync resumes it", () => {
	const device = new DeviceState(memoryStore(), false);
	assert.deepEqual(device.recordOutcome("aborted", false), { pausedNow: false });
	assert.deepEqual(device.recordOutcome("aborted", false), { pausedNow: false });
	assert.deepEqual(device.recordOutcome("aborted", false), { pausedNow: true });
	assert.equal(device.paused, true);
	device.recordOutcome("ok", false);
	assert.equal(device.paused, true, "a scheduled success does not resume");
	device.recordOutcome("ok", true);
	assert.equal(device.paused, false);
	assert.equal(device.failures, 0);
});

test("a 401 pauses at once", () => {
	const device = new DeviceState(memoryStore(), false);
	assert.deepEqual(device.recordOutcome("auth", false), { pausedNow: true });
	assert.equal(device.paused, true);
});

test("a completed run with per-recording errors does not count toward the pause", () => {
	const device = new DeviceState(memoryStore(), false);
	device.recordOutcome("aborted", false);
	device.recordOutcome("aborted", false);
	device.recordOutcome("ok", false);
	device.recordOutcome("aborted", false);
	assert.equal(device.paused, false);
	assert.equal(device.failures, 1);
});

test("stored values of the wrong type fall back to defaults", () => {
	const store = memoryStore();
	store.data.set(`${KEY_PREFIX}auto-sync`, "yes");
	store.data.set(`${KEY_PREFIX}folders`, [{ nope: 1 }]);
	const device = new DeviceState(store, false);
	assert.equal(device.autoSync, true);
	assert.equal(device.cachedFolders, null);
});
