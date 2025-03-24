import { generateUUID } from "./common.js";
import { AsyncMap } from "./asyncmap.js";

/* global console, messenger, setTimeout, clearTimeout */

const verbose = true;

const DEFAULT_TIMEOUT = 30 * 1024;
const DEFAULT_CONNECTION_TIMEOUT = 5 * 1024;
const NO_TIMEOUT = 0;

class Request {
    constructor(requests) {
        this.id = generateUUID();
        this.requests = requests;
        this.timer = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    post(port, message, timeout = DEFAULT_TIMEOUT) {
        return new Promise((resolve, reject) => {
            try {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
                if (timeout !== NO_TIMEOUT) {
                    this.timer = setTimeout(() => {
                        this.reject(new Error("request timeout:", this));
                    }, timeout);
                }
                this.requests.pendingRequests.set(this.id, this).then(() => {
                    message.requestId = this.id;
                    if (verbose) {
                        console.log("post:", this, message);
                    }
                    this.requests.port.postMessage(message);
                });
            } catch (e) {
                this.reject(e);
            }
        });
    }

    remove() {
        clearTimeout(this.timer);
        this.requests.pendingRequests.pop(this.id).then(() => {
            if (verbose) {
                console.log("remove:", this.id);
            }
        });
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
            if (verbose) {
                console.debug("resolve:", this, message);
            }
            this.resolvePromise(result);
        } catch (e) {
            this.rejectPromise(e);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  Requests - IPC manager
//
///////////////////////////////////////////////////////////////////////////////

export class Requests {
    constructor(name, eventHandlers) {
        this.name = name;
        this.id = generateUUID();
        this.port = null;
        this.listening = false;
        this.connecting = false;
        this.connectTarget = null;
        this.eventHandlers = eventHandlers;
        this.handlers = new AsyncMap();
        this.connectTimer = null;
        this.connectResolve = null;
        this.connectReject = null;
        this.pendingRequests = new AsyncMap();
    }

    isConnected() {
        return this.port !== null;
    }

    ConnectionComplete(timeout = DEFAULT_CONNECTION_TIMEOUT) {
        return new Promise((resolve, reject) => {
            try {
                if (this.isConnected()) {
                    resolve();
                }
                this.connectResolve = resolve;
                this.connectReject = reject;
                if (timeout !== NO_TIMEOUT) {
                    this.connectTimer = setTimeout(() => {
                        this.connectReject(new Error("timed out awaiting connection:", this));
                    }, timeout);
                }
            } catch (e) {
                this.connectReject(e);
            }
        });
    }

    async onConnect(port) {
        try {
            if (verbose) {
                console.debug("onConnect:", { requests: this, port: port });
                if (this.listening) {
                    console.log(this.name + " has accepted a connection from " + port.name);
                } else if (this.connecting) {
                    console.log(this.name + " has connected to " + this.connectTarget + " on port:", port);
                } else {
                    console.error("unexpected onConnected event");
                }
            }
            this.port = port;
            this.connected = true;
            port.onMessage.addListener(this.eventHandlers.onMessage);
            port.onDisconnect.addListener(this.eventHandlers.onDisconnect);
            if (this.connectHandler !== null) {
                console.debug("calling connect handler");
                await this.connectHandler(this);
            }
            if (this.connectResolve !== null) {
                console.debug("resolving:", this.connectResolve);
                this.connectResolve();
                this.removeConnectionWait();
            }
        } catch (e) {
            if (this.connectReject !== null) {
                console.debug("rejecting:", this.connectReject);
                this.connectReject(e);
                this.removeConnectionWait();
            } else {
                console.error(e);
                console.error(e);
            }
        }
    }

    removeConnectionWait() {
        try {
            if (this.connectTimer !== null) {
                clearTimeout(this.connectTimer);
                this.connectTimer = null;
            }
            this.connectResolve = null;
            this.connectReject = null;
        } catch (e) {
            console.error(e);
        }
    }

    async onMessage(message, sender, sendResponse) {
        try {
            if (verbose) {
                console.debug("Requests.onPortMessage:", {
                    requests: this,
                    message: message,
                    sender: sender,
                    sendResponse: sendResponse,
                });
            }
            if (message.responseId !== undefined) {
                await this.handleResponse(message);
            } else if (message.requestId !== undefined) {
                await this.handleRequest(message);
            } else {
                console.log("message is niether request nor response:", this.name, {
                    message: message,
                    sender: sender,
                    requests: this,
                });
                throw new Error("unexpected message type:", this, message, sender);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onDisconnect(port) {
        try {
            if (verbose) {
                console.log("port disconnected:", { requests: this, port: port });
            }
            this.connected = false;
            this.port = null;
            if (this.disconnectHandler !== null) {
                await this.disconnectHandler(this);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async handleRequest(message, sender) {
        try {
            const handler = await this.handlers.get(message.id);
            if (verbose) {
                console.log(this.name + " received request: ", message.id, message);
            }
            if (handler !== undefined) {
                if (verbose) {
                    console.debug(this.name + ": calling handler:", {
                        id: message.id,
                        message: message,
                        sender: sender,
                        handler: handler,
                    });
                }
                const result = await handler(message, sender);
                if (verbose) {
                    console.debug(this.name + ": handler returned:", { id: message.id, result: result });
                }
                await this.respond(sender, message, result);
            } else {
                console.error("handler not found for request:", this, {
                    message: message,
                    sender: sender,
                    handlers: await this.handlers.keys(),
                });
                throw new Error("handler not found for request");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async handleResponse(message, sender) {
        try {
            const request = await this.pendingRequests.pop(message.responseId);
            if (request !== undefined) {
                request.resolve(message);
            } else {
                console.error("pending request not found for response:", this, {
                    message: message,
                    sender: sender,
                    requests: await this.pendingRequests.keys(),
                });
                throw new Error("pending request not found for response");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async respond(message, sender, result = undefined) {
        try {
            if (message.requestId && message.requestId !== undefined) {
                message.result = result;
                message.id = message.id + "Response";
                message.responseId = message.requestId;
                if (verbose) {
                    console.log(this.name + ": sending response to " + sender.name + ":", { message: message, sender: sender });
                }
                this.port.postMessage(message);
            } else {
                throw new Error("missing requestId: " + String(message));
            }
        } catch (e) {
            console.error(e);
        }
    }

    async listen(onConnect, onMessage, onDisconnect) {
        try {
            if (this.connecting) {
                console.error("listen after connect:", this);
                throw new Error("cannot listen after connect");
            }
            this.listening = true;
            this.listenerMessageEvent = onMessage;
            this.listenerDisconnectEvent = onDisconnect;
            console.log(this.name + " is listening for connections...");
            await messenger.runtime.onConnect.addListener(onConnect);
        } catch (e) {
            console.error(e);
        }
    }

    async connect(target, onConnect, onMessage, onDisconnect) {
        try {
            if (this.listening) {
                console.error("connect after listen:", this);
                throw new Error("cannot connect after listen");
            }
            this.connecting = true;
            this.connectTarget = target;
            console.log(this.name + " is connecting to " + target + "...");
            await messenger.runtime.onConnect.addListener(onConnect);
            this.port = await messenger.runtime.connect(undefined, { name: this.name });
            await this.port.onMessage.addListener(onMessage);
            await this.port.onDisconnect.addListener(onDisconnect);
            await this.onConnect(this.port);
            return this;
        } catch (e) {
            console.error(e);
        }
    }

    async send(message, timeout = undefined) {
        try {
            let request = new Request(this);
            const before = await this.pendingRequests.get(request.id);
            if (before !== request) {
                console.debug("pending request missing:", this, request, before, await this.pendingRequests.keys());
                throw new Error("request not pending");
            }
            if (typeof message === "string") {
                message = { id: message };
            }
            if (verbose) {
                console.log(this.name + " sending request: ", message);
            }
            const response = await request.post(this.port, message, timeout);
            if (verbose) {
                console.log(this.name + " received response: ", response);
            }
            const after = await this.pendingRequests.gets(request.id);
            if (after !== undefined) {
                console.debug("zombie request:", this, request, after, await this.pendingRequests.keys());
                throw new Error("request still pending after response");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async disconnect() {
        try {
            if (messenger.runtime.onConnect.hasListener(this.onConnect)) {
                messenger.runtime.onConnect.removeListener(this.onConnect);
            }
            if (this.port !== null) {
                if (this.port.onMessage.hasListener(this.onMessage)) {
                    this.port.onMessage.removeListener(this.onMessage);
                }
                if (this.port.onDisconnect.hasListener(this.onDisconnect)) {
                    this.port.onDisconnect.removeListener(this.onDisconnect);
                }
                this.port.disconnect();
                this.port = null;
            }
            this.listening = false;
            this.connecting = false;
        } catch (e) {
            console.error(e);
        }
    }

    async addHandler(id, func) {
        try {
            if (await this.handlers.has(id)) {
                throw new Error("handler already exists: " + id);
            }
            await this.handlers.set(id, func);
            console.log("Requests.addHandler:", await this.handlers.get(id));
        } catch (e) {
            console.error(e);
        }
    }

    async removeHandler(id) {
        try {
            async function reaper(key, value) {
                const ret = key === id || value === id;
                console.debug("reaper:", { id: id, key: key, value: value, ret: ret });
                return ret;
            }
            const found = await this.handlers.scan(reaper);
            for (const [id, handler] of found.entries()) {
                await this.handlers.pop(id);
                console.log("removeHandler:", { id: id, handler: handler });
            }
            return;
        } catch (e) {
            console.error(e);
        }
    }
}

/*
async function addEventListener(eventSource, handler) {
    try {
        await eventSource.addListener(async (port) => {
            await handler(port);
        });
    } catch (e) {
        console.error(e);
    }
}

async function addPortEventListener(portEvent, handler) {
    try {
        portEvent.addListener(async (port) => {
            await handler(port);
        });
    } catch (e) {
        console.error(e);
    }
}
*/
