import { RateLimitBudgetError } from "./errors";
import { header } from "./transport";

/** Longest single wait for one 429. */
export const MAX_WAIT_MS = 60_000;
/** A request that gets this many 429s in a row gives up on the next one. */
export const MAX_CONSECUTIVE_WAITS = 5;
export const DESKTOP_RUN_BUDGET_MS = 10 * 60_000;
export const MOBILE_RUN_BUDGET_MS = 3 * 60_000;
const MIN_WAIT_MS = 1_000;

/**
 * The total time one sync run may spend waiting out rate limits. Shared by every request in the
 * run; once it is spent, the run stops fetching and writes what it already has.
 */
export class RateLimitBudget {
	private spentMs = 0;

	constructor(readonly totalMs: number) {}

	get remainingMs(): number {
		return Math.max(0, this.totalMs - this.spentMs);
	}

	/** Claims `ms` of waiting, or throws when the run cannot afford it. */
	spend(ms: number): void {
		if (this.spentMs + ms > this.totalMs) {
			this.spentMs = this.totalMs;
			throw new RateLimitBudgetError(
				`Pocket kept rate limiting requests for more than ${Math.round(this.totalMs / 60_000)} minutes. The next sync continues from here.`,
			);
		}
		this.spentMs += ms;
	}
}

/**
 * How long to wait after one 429: `Retry-After` (seconds or an HTTP date), then `X-RateLimit-Reset`
 * (epoch seconds), then exponential backoff. Always at least a second, at most a minute.
 */
export function waitForRateLimit(headers: Record<string, string>, nowMs: number, consecutive: number): number {
	const hint = retryAfterMs(headers, nowMs) ?? resetMs(headers, nowMs);
	const wait = hint ?? MIN_WAIT_MS * 2 ** consecutive;
	return Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, wait));
}

function retryAfterMs(headers: Record<string, string>, nowMs: number): number | null {
	const raw = header(headers, "Retry-After")?.trim();
	if (!raw) {
		return null;
	}
	if (/^\d+$/.test(raw)) {
		return Number.parseInt(raw, 10) * 1000;
	}
	const date = Date.parse(raw);
	return Number.isNaN(date) ? null : Math.max(0, date - nowMs);
}

function resetMs(headers: Record<string, string>, nowMs: number): number | null {
	const raw = header(headers, "X-RateLimit-Reset")?.trim();
	if (!raw || !/^\d+$/.test(raw)) {
		return null;
	}
	return Math.max(0, Number.parseInt(raw, 10) * 1000 - nowMs);
}
