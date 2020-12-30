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
      concurrency: options.concurrency || 100,
    });
  }

  add(fn: AsyncFunction, options?: QueueItemOptions) {
    if (options?.delay) {
      console.log(`adding a job with a delay!`);
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
      const timer = setInterval(() => {
        if (this.activeTimers === 0) {
          clearInterval(timer);
          resolve();
          return;
        }
      }, 1000);
    });
  }
}
