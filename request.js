import { generateUUID } from "./common.js";

const REQUEST_MESSAGE_TIMEOUT = 3000;

var pendingRequests = {};

class Request {
    constructor() {
        this.id = generateUUID();
        this.timer = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.responseKey = null;
    }

    post(port, message, timeout = null) {
        return new Promise((resolve, reject) => {
            try {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
                this.port = port;
                this.responseKey = message.responseKey;
                if (!timeout) {
                    timeout = REQUEST_MESSAGE_TIMEOUT;
                }
                this.timer = setTimeout(() => {
                    this.reject(new Error("timeout:", this));
                }, timeout);
                pendingRequests[this.id] = this;
                message.requestId = this.id;
                port.postMessage(message);
            } catch (e) {
                this.reject(e);
            }
        });
    }

    remove() {
        delete pendingRequests[this.id];
        clearTimeout(this.timer);
    }

    reject(error) {
        this.remove();
        this.rejectPromise(error);
    }

    resolve(result = undefined) {
        this.remove();
        if (typeof result === "object" && this.responseKey) {
            result = result[this.responseKey];
        }
        console.log("resolving response:", result);
        this.resolvePromise(result);
    }
}

export function sendMessage(port, message, timeout = null) {
    try {
        let request = new Request();
        return request.post(port, message, timeout);
    } catch (e) {
        console.error(e);
    }
}

// returns true if message was handled by a resolver
export function resolveResponse(message) {
    try {
        if (message.responseId && pendingRequests[message.responseId]) {
            pendingRequests[message.responseId].resolve(message);
            return true;
        }
        return false;
    } catch (e) {
        console.error(e);
    }
}

export function respond(port, message, response = {}) {
    try {
        if (message.requestId) {
            response.id = message.id + "Response";
            response.responseId = message.requestId;
            port.postMessage(response);
            return;
        }
        throw new Error("missing requestId:", message);
    } catch (e) {
        console.error(e);
    }
}
