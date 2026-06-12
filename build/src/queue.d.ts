import { EventEmitter } from 'node:events';
export type QueueOptions = {
    concurrency: number;
};
export type QueueItemOptions = {
    delay?: number;
};
export type AsyncFunction = () => Promise<void>;
export declare class Queue extends EventEmitter {
    private readonly q;
    private activeFunctions;
    private readonly concurrency;
    constructor(options: QueueOptions);
    on(event: 'done', listener: () => void): this;
    add(function_: AsyncFunction, options?: QueueItemOptions): void;
    onIdle(): Promise<void>;
    private tick;
}
