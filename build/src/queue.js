"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const events_1 = require("events");
class Queue extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.q = [];
        this.activeFunctions = 0;
        this.concurrency = options.concurrency;
    }
    add(fn, options) {
        const delay = (options === null || options === void 0 ? void 0 : options.delay) || 0;
        const timeToRun = Date.now() + delay;
        this.q.push({
            fn,
            timeToRun,
        });
        setTimeout(() => this.tick(), delay);
    }
    tick() {
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
            const item = this.q.shift();
            // make sure this element is ready to execute - if not, to the back of the stack
            if (item.timeToRun > Date.now()) {
                this.q.push(item);
            }
            else {
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
        return new Promise(resolve => {
            this.on('done', () => resolve());
        });
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map