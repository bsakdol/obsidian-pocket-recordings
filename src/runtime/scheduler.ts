export interface IntervalClock {
	setInterval(callback: () => void, ms: number): number;
	clearInterval(id: number): void;
}

/**
 * Runs `tick` once when started (after the workspace has loaded) and then every interval.
 * Changing the interval re-arms the one timer; intervals never stack.
 */
export class Scheduler {
	private timer: number | null = null;

	constructor(
		private readonly clock: IntervalClock,
		private readonly tick: () => void,
	) {}

	get armed(): boolean {
		return this.timer !== null;
	}

	start(intervalMinutes: number): void {
		this.arm(intervalMinutes);
		this.tick();
	}

	/** Re-arms with a new interval without running a tick now. */
	reschedule(intervalMinutes: number): void {
		if (this.timer !== null) this.arm(intervalMinutes);
	}

	stop(): void {
		if (this.timer !== null) this.clock.clearInterval(this.timer);
		this.timer = null;
	}

	private arm(intervalMinutes: number): void {
		this.stop();
		this.timer = this.clock.setInterval(this.tick, intervalMinutes * 60_000);
	}
}
