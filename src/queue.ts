import {EventEmitter} from 'node:events';

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

	constructor(options: QueueOptions) {
		super();
		this.concurrency = options.concurrency;
		// It was noticed in test that setTimeout() could sometimes trigger an event
		// moments before it was scheduled. This leads to a delta between timeToRun
		// and Date.now(), and a link may never crawl. This setInterval() ensures
		// these items are eventually processed.
		setInterval(() => {
			if (this.activeFunctions === 0) this.tick();
		}, 2500).unref();
	}

	on(event: 'done', listener: () => void): this;
	on(event: string | symbol, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}

	add(fn: AsyncFunction, options?: QueueItemOptions) {
		const delay = options?.delay || 0;
		const timeToRun = Date.now() + delay;
		this.q.push({
			fn,
			timeToRun,
		});
		setTimeout(() => {
			this.tick();
		}, delay);
	}

	async onIdle() {
		return new Promise<void>((resolve) => {
			this.on('done', () => {
				resolve();
			});
		});
	}

	private tick() {
		// Check if we're complete
		if (this.activeFunctions === 0 && this.q.length === 0) {
			this.emit('done');
			return;
		}

		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let i = 0; i < this.q.length; i++) {
			// Check if we have too many concurrent functions executing
			if (this.activeFunctions >= this.concurrency) {
				return;
			}

			// Grab the element at the front of the array
			const item = this.q.shift()!;
			// Make sure this element is ready to execute - if not, to the back of the stack
			if (item.timeToRun <= Date.now()) {
				// This function is ready to go!
				this.activeFunctions++;
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				item.fn().finally(() => {
					this.activeFunctions--;
					this.tick();
				});
			} else {
				this.q.push(item);
			}
		}
	}
}
