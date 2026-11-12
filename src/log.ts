const MAX_RECENT = 20;

/**
 * Console logging behind the debug toggle. Errors are always logged and the most recent ones
 * are kept, redacted later, for the diagnostic report.
 */
export class Logger {
	private readonly recent: string[] = [];

	constructor(private readonly debugEnabled: () => boolean) {}

	debug(message: string, details?: unknown): void {
		if (!this.debugEnabled()) return;
		if (details === undefined) console.debug(`[Pocket Recordings] ${message}`);
		else console.debug(`[Pocket Recordings] ${message}`, details);
	}

	error(message: string, error?: unknown): void {
		const detail = error instanceof Error ? error.message : typeof error === "string" ? error : error === undefined ? null : JSON.stringify(error);
		const text = detail ? `${message}: ${detail}` : message;
		this.remember(text);
		console.error(`[Pocket Recordings] ${message}`, error ?? "");
	}

	/** Keeps a message for diagnostics without writing it to the console. */
	remember(message: string): void {
		this.recent.push(`${new Date().toISOString()} ${message}`);
		if (this.recent.length > MAX_RECENT) this.recent.shift();
	}

	recentErrors(): string[] {
		return [...this.recent];
	}
}
