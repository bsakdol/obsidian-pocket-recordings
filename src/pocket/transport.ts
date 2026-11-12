import { requestUrl } from "obsidian";

export interface HttpRequest {
	url: string;
	method: "GET";
	headers: Record<string, string>;
}

export interface HttpResponse {
	status: number;
	json: unknown;
	headers: Record<string, string>;
}

export type Requester = (request: HttpRequest) => Promise<HttpResponse>;

/** Obsidian's `requestUrl`, which works on desktop and mobile without Node APIs. */
export const obsidianRequester: Requester = async (request) => {
	const response = await requestUrl({ ...request, throw: false });
	let json: unknown = null;
	try {
		json = response.json as unknown;
	} catch {
		json = null;
	}
	return { status: response.status, json, headers: response.headers };
};

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Rejects with `onTimeout()` when `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
	return new Promise((resolve, reject) => {
		const id = window.setTimeout(() => reject(onTimeout()), ms);
		promise.then(
			(value) => {
				window.clearTimeout(id);
				resolve(value);
			},
			(error: unknown) => {
				window.clearTimeout(id);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}

export function header(headers: Record<string, string>, name: string): string | undefined {
	const lower = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === lower) {
			return value;
		}
	}
	return undefined;
}
