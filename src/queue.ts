import PQueue from 'p-queue';

export interface QueueOptions {
  concurrency?: number;
}

export interface QueueItemOptions {
  delay?: number;
}

export type AsyncFunction = () => Promise<void>;

export class Queue {
  private q: PQueue;
  private activeTimers = 0;

  constructor(options: QueueOptions) {
    this.q = new PQueue({
      concurrency: options.concurrency,
    });
  }

  add(fn: AsyncFunction, options?: QueueItemOptions) {
    if (options?.delay) {
      setTimeout(() => {
        this.q.add(fn);
        this.activeTimers--;
      }, options.delay);
      this.activeTimers++;
    } else {
      this.q.add(fn);
    }
  }

  async onIdle() {
    await this.q.onIdle();
    await new Promise<void>(resolve => {
      if (this.activeTimers === 0) {
        resolve();
        return;
      }
      const timer = setInterval(async () => {
        if (this.activeTimers === 0) {
          await this.q.onIdle();
          clearInterval(timer);
          resolve();
          return;
        }
      }, 500);
    });
  }
}
