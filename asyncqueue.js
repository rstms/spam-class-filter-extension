class QueueItem {
    constructor(item) {
        this.item = item;
        this.created = new Date();
    }

    age() {
        const now = new Date();
        const elapsed = Math.floor((now - this.created) / 1000);
        return elapsed;
    }
}

export class AsyncQueue {
    constructor() {
        this.queue = [];
        this.locked = false;
        this.waiting = [];
    }

    async lock() {
        while (this.locked) {
            await new Promise((resolve) => this.waiting.push(resolve));
        }
        this.locked = true;
    }

    unlock() {
        this.locked = false;
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next();
        }
    }

    async push(item) {
        await this.lock();
        this.queue.push(QueueItem(item));
        this.unlock();
    }

    async put(item) {
        return await this.push(item);
    }

    async get() {
        await this.lock();
        var item = this.queue.shift();
        this.unlock();
        if (item) {
            item = item.item;
        }
        return item;
    }

    async pop() {
        await this.lock();
        var item = this.queue.pop();
        this.unlock();
        if (item) {
            item = item.item;
        }
        return item;
    }

    async size() {
        await this.lock();
        const length = this.queue.length;
        this.unlock();
        return length;
    }

    async expire(timeout) {
        await this.lock();
        var active = [];
        var expired = [];
        for (let i = 0; i < this.queue.length; i++) {
            if (this.queue[i].age() > timeout) {
                expired.push(this.queue[i].item);
            } else {
                active.push(this.queue[i]);
            }
        }
        this.queue = active;
        this.unlock();
        return expired;
    }
}
