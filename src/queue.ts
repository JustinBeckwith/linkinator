import {EventEmitter} from 'events';

export interface QueueOptions {
  concurrency: number;
}

export interface QueueItemOptions {
  delay?: number;
}

interface QueueItem {
  fn: AsyncFunction;
  timeToRun: number;
}

export declare interface Queue {
  on(event: 'done', listener: () => void): this;
}

export type AsyncFunction = () => Promise<void>;

export class Queue extends EventEmitter {
  private q: Array<QueueItem> = [];
  private activeFunctions = 0;
  private concurrency: number;

  constructor(options: QueueOptions) {
    super();
    this.concurrency = options.concurrency;
  }

  add(fn: AsyncFunction, options?: QueueItemOptions) {
    const delay = options?.delay || 0;
    const timeToRun = Date.now() + delay;
    this.q.push({
      fn,
      timeToRun,
    });
    setTimeout(() => this.tick(), delay);
  }

  private tick() {
    // Check if we're complete
    if (this.activeFunctions === 0 && this.q.length === 0) {
      this.emit('done');
      return;
    }

    for (let i = 0; i < this.q.length; i++) {
      // Check if we have too many concurrent functions executing
      if (this.activeFunctions >= this.concurrency) {
        return;
      }
      // grab the element at the front of the array
      const item = this.q.shift()!;
      // Depending on CPU load and other factors setTimeout() is not guranteed to run exactly
      // when scheduled. This causes problems if there is only one item in the queue, as
      // there's a chance it will never be processed. Allow for a small delta to address this:
      const delta = 150;
      const readyToExecute =
        Math.abs(item.timeToRun - Date.now()) < delta ||
        item.timeToRun < Date.now();
      // make sure this element is ready to execute - if not, to the back of the stack
      if (readyToExecute) {
        // this function is ready to go!
        this.activeFunctions++;
        item.fn().finally(() => {
          this.activeFunctions--;
          this.tick();
        });
      } else {
        this.q.push(item);
      }
    }
  }

  async onIdle() {
    return new Promise<void>(resolve => {
      this.on('done', () => resolve());
    });
  }
}
