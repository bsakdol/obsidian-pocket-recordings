import type { ListedRecording, PocketTag, RecordingDetail } from "../model";
import { AuthError, NetworkError, PocketError, RateLimitBudgetError, ShapeError } from "./errors";
import { FolderTree } from "./folders";
import { mapDetail, mapListed, mapTag } from "./mappers";
import { MAX_CONSECUTIVE_WAITS, RateLimitBudget, waitForRateLimit } from "./rateLimit";
import type { RawEnvelope } from "./raw";
import { sleep as realSleep, withTimeout, type Requester } from "./transport";

export const POCKET_API_BASE_URL = "https://public.heypocketai.com/api/v1";
export const PAGE_SIZE = 100;
const RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const TIMEOUT_MS = 30_000;

export interface PocketClientDeps {
	request: Requester;
	sleep?: (ms: number) => Promise<void>;
	/** Epoch milliseconds. */
	now?: () => number;
	/** Shared by every request in one run. */
	budget: RateLimitBudget;
	/** Called before each rate-limit wait, for logging. */
	onWait?: (ms: number) => void;
}

/** A typed client for the four Pocket endpoints the plugin uses. */
export class PocketClient {
	private readonly sleep: (ms: number) => Promise<void>;
	private readonly now: () => number;

	constructor(
		private readonly apiKey: string,
		private readonly deps: PocketClientDeps,
	) {
		this.sleep = deps.sleep ?? realSleep;
		this.now = deps.now ?? Date.now;
	}

	/**
	 * Every recording from `startDate` (`YYYY-MM-DD`, or all history when null). Pages until a short
	 * page. Any page failure throws, so a caller never sees a partial listing.
	 */
	async listAll(startDate: string | null): Promise<ListedRecording[]> {
		const all: ListedRecording[] = [];
		for (let page = 1; ; page++) {
			const envelope = await this.get("/public/recordings", {
				...(startDate ? { start_date: startDate } : {}),
				page: String(page),
				limit: String(PAGE_SIZE),
			});
			if (!Array.isArray(envelope.data)) {
				throw new ShapeError("Pocket returned the recording list in an unexpected format.");
			}
			for (const item of envelope.data) all.push(mapListed(item));
			if (envelope.data.length < PAGE_SIZE) return all;
		}
	}

	async getDetail(listed: ListedRecording): Promise<RecordingDetail> {
		const envelope = await this.get(`/public/recordings/${encodeURIComponent(listed.id)}`, {
			include_transcript: "true",
			include_summarizations: "true",
		});
		return mapDetail(envelope.data, listed);
	}

	async listFolders(): Promise<FolderTree> {
		return FolderTree.fromRaw((await this.get("/public/folders")).data);
	}

	async listTags(): Promise<PocketTag[]> {
		const data = (await this.get("/public/tags")).data;
		if (!Array.isArray(data)) {
			throw new ShapeError("Pocket returned the tag list in an unexpected format.");
		}
		return data.map(mapTag).filter((tag): tag is PocketTag => tag !== null);
	}

	private async get(path: string, query: Record<string, string> = {}): Promise<RawEnvelope> {
		const url = new URL(POCKET_API_BASE_URL + path);
		for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);

		let failures = 0;
		let rateLimited = 0;
		for (;;) {
			let status: number;
			let json: unknown;
			let headers: Record<string, string>;
			try {
				({ status, json, headers } = await withTimeout(
					this.deps.request({
						url: url.toString(),
						method: "GET",
						headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
					}),
					TIMEOUT_MS,
					() => new NetworkError(`Pocket did not answer within ${TIMEOUT_MS / 1000} seconds.`),
				));
			} catch (error) {
				if (failures < RETRIES) {
					failures += 1;
					await this.sleep(RETRY_DELAY_MS * failures);
					continue;
				}
				throw error instanceof PocketError ? error : new NetworkError("Could not reach Pocket. Check the connection.");
			}

			if (status >= 200 && status < 300) {
				const envelope = json !== null && typeof json === "object" ? (json as RawEnvelope) : null;
				if (!envelope) throw new ShapeError("Pocket returned a response that is not JSON.");
				return envelope;
			}
			if (status === 401) throw new AuthError();
			if (status === 429) {
				if (rateLimited >= MAX_CONSECUTIVE_WAITS) {
					throw new RateLimitBudgetError("Pocket kept rate limiting one request. The next sync continues from here.");
				}
				const waitMs = waitForRateLimit(headers, this.now(), rateLimited);
				this.deps.budget.spend(waitMs);
				rateLimited += 1;
				this.deps.onWait?.(waitMs);
				await this.sleep(waitMs);
				continue;
			}
			rateLimited = 0;
			if (status >= 500 && failures < RETRIES) {
				failures += 1;
				await this.sleep(RETRY_DELAY_MS * failures);
				continue;
			}
			const message = (json as RawEnvelope | null)?.error;
			throw new NetworkError(typeof message === "string" && message ? `Pocket: ${message}` : `Pocket answered with HTTP ${status}.`, status);
		}
	}
}
