import { assert, describe, it, vi } from 'vitest';
import { Queue } from '../src/queue.js';

describe('Queue', () => {
	it('keeps a referenced wake-up for delayed work', async () => {
		vi.useFakeTimers();
		try {
			const queue = new Queue({ concurrency: 1 });
			let ran = false;

			queue.add(
				async () => {
					ran = true;
				},
				{ delay: 1000 },
			);

			const idle = queue.onIdle();
			assert.strictEqual(vi.getTimerCount(), 1);
			await vi.advanceTimersByTimeAsync(1000);
			await idle;
			assert.isTrue(ran);
		} finally {
			vi.useRealTimers();
		}
	});

	it('resolves immediately when already idle', async () => {
		const queue = new Queue({ concurrency: 1 });
		await queue.onIdle();
	});

	it('runs newly added immediate work before an existing delayed item', async () => {
		vi.useFakeTimers();
		try {
			const queue = new Queue({ concurrency: 1 });
			const order: string[] = [];

			queue.add(
				async () => {
					order.push('delayed');
				},
				{ delay: 1000 },
			);
			queue.add(async () => {
				order.push('immediate');
			});

			await vi.advanceTimersByTimeAsync(0);
			assert.deepEqual(order, ['immediate']);
			await vi.advanceTimersByTimeAsync(1000);
			await queue.onIdle();
			assert.deepEqual(order, ['immediate', 'delayed']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not lose delayed work when active work completes', async () => {
		vi.useFakeTimers();
		try {
			const queue = new Queue({ concurrency: 1 });
			const order: string[] = [];

			queue.add(async () => {
				order.push('active');
			});
			queue.add(
				async () => {
					order.push('delayed');
				},
				{ delay: 1000 },
			);

			const idle = queue.onIdle();
			await vi.advanceTimersByTimeAsync(0);
			assert.deepEqual(order, ['active']);
			assert.strictEqual(vi.getTimerCount(), 1);
			await vi.advanceTimersByTimeAsync(1000);
			await idle;
			assert.deepEqual(order, ['active', 'delayed']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('includes work added by a running task before becoming idle', async () => {
		const queue = new Queue({ concurrency: 1 });
		const order: string[] = [];

		queue.add(async () => {
			order.push('parent');
			queue.add(async () => {
				order.push('child');
			});
		});

		await queue.onIdle();
		assert.deepEqual(order, ['parent', 'child']);
	});

	it('continues draining after a task rejects', async () => {
		const queue = new Queue({ concurrency: 1 });
		let completed = false;

		queue.add(async () => {
			throw new Error('expected test failure');
		});
		queue.add(async () => {
			completed = true;
		});

		await queue.onIdle();
		assert.isTrue(completed);
	});

	it('honors concurrency while draining queued work', async () => {
		vi.useFakeTimers();
		try {
			const queue = new Queue({ concurrency: 2 });
			let active = 0;
			let maximumActive = 0;

			for (let i = 0; i < 6; i++) {
				queue.add(async () => {
					active++;
					maximumActive = Math.max(maximumActive, active);
					await new Promise((resolve) => setTimeout(resolve, 100));
					active--;
				});
			}

			const idle = queue.onIdle();
			await vi.runAllTimersAsync();
			await idle;
			assert.strictEqual(maximumActive, 2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('notifies multiple idle waiters', async () => {
		const queue = new Queue({ concurrency: 1 });
		queue.add(async () => {});

		await Promise.all([queue.onIdle(), queue.onIdle()]);
	});

	it('drains a deterministic mix of delayed, nested, and failing work', async () => {
		vi.useFakeTimers();
		try {
			const concurrency = 7;
			const queue = new Queue({ concurrency });
			const completed = new Set<number>();
			let active = 0;
			let maximumActive = 0;
			let randomState = 0x5eed;

			const random = () => {
				randomState = (randomState * 16_807) % 2_147_483_647;
				return randomState;
			};

			const addTask = (id: number, depth: number) => {
				queue.add(
					async () => {
						active++;
						maximumActive = Math.max(maximumActive, active);
						await new Promise((resolve) => setTimeout(resolve, random() % 20));
						completed.add(id);

						if (depth > 0 && id % 4 === 0) {
							addTask(id + 1000, depth - 1);
						}

						active--;
						if (id % 13 === 0) {
							throw new Error('expected deterministic failure');
						}
					},
					{ delay: random() % 50 },
				);
			};

			for (let id = 1; id <= 200; id++) {
				addTask(id, 2);
			}

			const idle = queue.onIdle();
			await vi.runAllTimersAsync();
			await idle;

			const expectedNestedTasks =
				Array.from({ length: 200 }, (_, index) => index + 1).filter(
					(id) => id % 4 === 0,
				).length +
				Array.from({ length: 200 }, (_, index) => index + 1).filter(
					(id) => id % 4 === 0 && (id + 1000) % 4 === 0,
				).length;

			assert.strictEqual(completed.size, 200 + expectedNestedTasks);
			assert.isAtMost(maximumActive, concurrency);
			assert.strictEqual(active, 0);
			assert.strictEqual(vi.getTimerCount(), 0);
		} finally {
			vi.useRealTimers();
		}
	});
});
