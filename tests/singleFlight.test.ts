import assert from "node:assert/strict";
import { test } from "node:test";

import { SingleFlight } from "../src/runtime/singleFlight";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => (resolve = res));
	return { promise, resolve };
}

test("three requests during one run produce exactly one follow-up run with merged options", async () => {
	const runs: string[][] = [];
	const gates: ReturnType<typeof deferred>[] = [];
	const flight = new SingleFlight<string[], number>(
		async (options) => {
			runs.push(options);
			const gate = deferred();
			gates.push(gate);
			await gate.promise;
			return runs.length;
		},
		(a, b) => [...a, ...b],
	);
	const first = flight.request(["a"]);
	const followUps = [flight.request(["b"]), flight.request(["c"]), flight.request(["d"])];
	assert.equal(flight.running, true);
	gates[0]?.resolve();
	assert.equal(await first, 1);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(runs.length, 2);
	assert.deepEqual(runs[1], ["b", "c", "d"]);
	gates[1]?.resolve();
	assert.deepEqual(await Promise.all(followUps), [2, 2, 2]);
	assert.equal(flight.running, false);
});

test("a failing run still lets the follow-up run", async () => {
	let count = 0;
	const flight = new SingleFlight<null, number>(async () => {
		count += 1;
		if (count === 1) throw new Error("boom");
		return count;
	}, () => null);
	const first = flight.request(null);
	const second = flight.request(null);
	await assert.rejects(first);
	assert.equal(await second, 2);
});
