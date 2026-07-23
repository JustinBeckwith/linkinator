import { EventEmitter } from 'node:events';

export type QueueOptions = {
	concurrency: number;
};

export type QueueItemOptions = {
	delay?: number;
};

type QueueItem = {
	fn: AsyncFunction;
	timeToRun: number;
};

export type AsyncFunction = () => Promise<void>;

export class Queue extends EventEmitter {
	private readonly q: QueueItem[] = [];
	private activeFunctions = 0;
	private readonly concurrency: number;
	private wakeup: NodeJS.Timeout | undefined;
	private wakeupTime: number | undefined;

	constructor(options: QueueOptions) {
		super();
		this.concurrency = options.concurrency;
	}

	on(event: 'done', listener: () => void): this;
	// biome-ignore lint/suspicious/noExplicitAny: this can actually be any
	on(event: string | symbol, listener: (...arguments_: any[]) => void): this {
		return super.on(event, listener);
	}

	add(function_: AsyncFunction, options?: QueueItemOptions) {
		const delay = options?.delay || 0;
		const timeToRun = Date.now() + delay;
		this.q.push({
			fn: function_,
			timeToRun,
		});
		this.scheduleWakeup();
	}

	async onIdle() {
		if (this.activeFunctions === 0 && this.q.length === 0) {
			return;
		}

		return new Promise<void>((resolve) => {
			this.once('done', () => {
				resolve();
			});
		});
	}

	private tick() {
		// Check if we're complete
		if (this.activeFunctions === 0 && this.q.length === 0) {
			this.cancelWakeup();
			this.emit('done');
			return;
		}

		// Inspect each currently queued item once. Delayed items are moved to the
		// back and handled by a referenced timer for the earliest due item.
		const queuedItems = this.q.length;
		for (let i = 0; i < queuedItems; i++) {
			// Check if we have too many concurrent functions executing
			if (this.activeFunctions >= this.concurrency) {
				break;
			}

			// Grab the element at the front of the array
			const item = this.q.shift();
			if (item === undefined) {
				throw new Error('unexpected undefined item in queue');
			}
			// Make sure this element is ready to execute - if not, to the back of the stack
			if (item.timeToRun <= Date.now()) {
				// This function is ready to go!
				this.activeFunctions++;
				item
					.fn()
					.catch(() => {
						// Errors are handled within crawl() and stored in results.
						// Silently catch here to prevent unhandled promise rejections.
					})
					.finally(() => {
						this.activeFunctions--;
						this.tick();
					});
			} else {
				this.q.push(item);
			}
		}

		if (this.q.length === 0) {
			this.cancelWakeup();
			return;
		}

		this.scheduleWakeup();
	}

	private cancelWakeup() {
		if (this.wakeup !== undefined) {
			clearTimeout(this.wakeup);
			this.wakeup = undefined;
			this.wakeupTime = undefined;
		}
	}

	private scheduleWakeup() {
		if (this.activeFunctions >= this.concurrency || this.q.length === 0) {
			return;
		}

		let nextRun = Number.POSITIVE_INFINITY;
		for (const item of this.q) {
			nextRun = Math.min(nextRun, item.timeToRun);
		}
		if (
			this.wakeup !== undefined &&
			this.wakeupTime !== undefined &&
			this.wakeupTime <= nextRun
		) {
			return;
		}

		if (this.wakeup !== undefined) {
			this.cancelWakeup();
		}

		this.wakeupTime = nextRun;
		this.wakeup = setTimeout(
			() => {
				this.wakeup = undefined;
				this.wakeupTime = undefined;
				this.tick();
			},
			Math.max(0, nextRun - Date.now()),
		);
	}
}
