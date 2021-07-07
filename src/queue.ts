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
  private readonly q: Array<QueueItem> = [];
  private activeFunctions = 0;
  private readonly concurrency: number;

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
      // make sure this element is ready to execute - if not, to the back of the stack
      if (item.timeToRun > Date.now()) {
        this.q.push(item);
      } else {
        // this function is ready to go!
        this.activeFunctions++;
        item.fn().finally(() => {
          this.activeFunctions--;
          this.tick();
        });
      }
    }
  }

  async onIdle() {
    return new Promise<void>(resolve => {
      this.on('done', () => resolve());
    });
  }
}
