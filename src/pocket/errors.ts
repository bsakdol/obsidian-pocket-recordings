export class PocketError extends Error {
	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

/** Pocket rejected the API key (HTTP 401). Aborts the run and pauses auto-sync at once. */
export class AuthError extends PocketError {
	constructor() {
		super("Pocket rejected the API key. Check it in settings and test the connection.");
	}
}

/** Waiting out rate limits would exceed this request's or this run's budget. */
export class RateLimitBudgetError extends PocketError {}

/** The request failed: no response, a timeout, or an HTTP error other than 401 and 429. */
export class NetworkError extends PocketError {
	constructor(
		message: string,
		readonly status: number | null = null,
	) {
		super(message);
	}
}

/** Pocket answered, but not in a shape the plugin understands. Carries no payload data. */
export class ShapeError extends PocketError {}
