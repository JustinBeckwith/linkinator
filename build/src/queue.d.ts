/// <reference types="node" />
import { EventEmitter } from 'events';
export interface QueueOptions {
    concurrency: number;
}
export interface QueueItemOptions {
    delay?: number;
}
export declare interface Queue {
    on(event: 'done', listener: () => void): this;
}
export declare type AsyncFunction = () => Promise<void>;
export declare class Queue extends EventEmitter {
    private q;
    private activeFunctions;
    private concurrency;
    constructor(options: QueueOptions);
    add(fn: AsyncFunction, options?: QueueItemOptions): void;
    private tick;
    onIdle(): Promise<void>;
}
