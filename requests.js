import { generateUUID } from "./common.js";

/* global console, setTimeout, clearTimeout */

//const DEFAULT_TIMEOUT = 1024;
const DEFAULT_TIMEOUT = 0;

var pendingRequests = {};
var registeredHandlers = {};

class Request {
    constructor() {
        this.id = generateUUID();
        this.timer = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    post(port, message, timeout = undefined) {
        return new Promise((resolve, reject) => {
            try {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
                this.port = port;
                if (timeout === undefined) {
                    timeout = DEFAULT_TIMEOUT;
                }
                if (timeout !== 0) {
                    this.timer = setTimeout(() => {
                        this.reject(new Error("timeout:", this));
                    }, timeout);
                }
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

    resolve(message = undefined) {
        try {
            this.remove();
            var result = message;
            if ("result" in message) {
                result = message.result;
            }
            console.log("resolving response:", result);
            this.resolvePromise(result);
        } catch (e) {
            this.rejectPromise(e);
        }
    }
}

export function sendMessage(port, message, timeout = undefined) {
    try {
        let request = new Request();
        if (typeof message === "string") {
            message = { id: message };
        }
        console.log("sendMessage:", port, message, timeout);
        return request.post(port, message, timeout);
    } catch (e) {
        console.error(e);
    }
}

// handle incoming responses to requests we're awaiting
// returns true if message was consumed
export async function resolveResponses(message) {
    //try {
    if (message.responseId && pendingRequests[message.responseId]) {
        pendingRequests[message.responseId].resolve(message);
        return true;
    }
    return false;
    /*
    } catch (e) {
        console.error(e);
    }
    */
}

// handle incoming requests and call our handlers to resolve
// returns true if message was consumed
export async function resolveRequests(message, sender, handlers = {}) {
    try {
        if (message.requestId) {
            let handler = registeredHandlers[message.id];
            if (handlers[message.id]) {
                handler = handlers[message.id];
            }
            if (handler) {
                console.log("resolveRequests: calling handler:", message.id);
                const result = await handler(message, sender);
                console.log("resolveRequests: handler returned:", result);
                await respond(sender, message, result);
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error(e);
    }
}

// respond to a request, can be called directly if resolveRequests handlers are not used
export async function respond(port, message, result = undefined) {
    try {
        if (message.requestId) {
            message.result = result;
            message.id = message.id + "Response";
            message.responseId = message.requestId;
            port.postMessage(message);
            return;
        }
        throw new Error("missing requestId:", message);
    } catch (e) {
        console.error(e);
    }
}

export function addHandler(id, func) {
    registeredHandlers[id] = func;
}

export function removeHandler(id) {
    for (const [key, value] of Object.entries(registeredHandlers)) {
        if (key === id || value == id) {
            delete registeredHandlers[key];
        }
    }
    return;
}
