import type { HttpRequest, HttpResponse, Requester } from "../../src/pocket/transport";

export type Handler = (request: HttpRequest, url: URL) => HttpResponse | Promise<HttpResponse>;

/** A requester that records every request and answers from `handler`. */
export function fakeTransport(handler: Handler): { request: Requester; calls: URL[] } {
	const calls: URL[] = [];
	return {
		calls,
		request: async (request) => {
			const url = new URL(request.url);
			calls.push(url);
			return handler(request, url);
		},
	};
}

export function ok(data: unknown, extra: Record<string, unknown> = {}): HttpResponse {
	return { status: 200, json: { success: true, data, ...extra }, headers: {} };
}

export function status(code: number, headers: Record<string, string> = {}): HttpResponse {
	return { status: code, json: { success: false, data: null, error: `HTTP ${code}` }, headers };
}

/** A fake clock whose sleep advances it instantly. */
export function fakeClock(startMs = Date.parse("2026-11-11T12:00:00Z")): { now: () => number; sleep: (ms: number) => Promise<void>; slept: number[] } {
	let current = startMs;
	const slept: number[] = [];
	return {
		slept,
		now: () => current,
		sleep: async (ms) => {
			slept.push(ms);
			current += ms;
		},
	};
}
