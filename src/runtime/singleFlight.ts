/**
 * Runs one task at a time. A request made while a run is in flight is served by exactly one
 * follow-up run, however many requests arrive; their options are merged.
 */
export class SingleFlight<O, T> {
	private current: Promise<T> | null = null;
	private pending: { options: O; promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } | null = null;

	constructor(
		private readonly task: (options: O) => Promise<T>,
		private readonly merge: (a: O, b: O) => O,
	) {}

	get running(): boolean {
		return this.current !== null;
	}

	request(options: O): Promise<T> {
		if (!this.current) return this.start(options);
		if (this.pending) {
			this.pending.options = this.merge(this.pending.options, options);
			return this.pending.promise;
		}
		let resolve!: (value: T) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		this.pending = { options, promise, resolve, reject };
		return promise;
	}

	private start(options: O): Promise<T> {
		const run = this.task(options);
		this.current = run;
		const settle = (): void => {
			this.current = null;
			const next = this.pending;
			this.pending = null;
			if (next) this.start(next.options).then(next.resolve, next.reject);
		};
		run.then(settle, settle);
		return run;
	}
}
