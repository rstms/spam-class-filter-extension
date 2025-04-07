import { generateUUID, differ, verbosity } from "./common.js";
import { domainPart } from "./common.js";
import { AsyncMap } from "./asyncmap.js";
import { config } from "./config.js";

/* global console, messenger, setTimeout, clearTimeout, setInterval, clearInterval, window */

// FIXME: remove compose window if message send fails
// FIXME: track the progress window
// FIXME: track the error message popup dialog when send fails

const verbose = verbosity.email;
const logQueue = false;

const DEFAULT_TIMEOUT = 60 * 1024;
const NO_TIMEOUT = 0;
const RESPONSE_EXPIRE_SECONDS = 60;
const RESPONSE_CHECK_INTERVAL = 1024;

const moduleCID = "module-" + generateUUID();

class EmailRequest {
    constructor(controller, autoDelete, minimizeCompose) {
        if (verbose) {
            console.debug("autoDelete:", autoDelete);
            console.debug("minimizeCompose:", minimizeCompose);
        }
        this.controller = controller;
        this.id = generateUUID();
        this.autoDelete = autoDelete;
        this.minimizeCompose = minimizeCompose;
        this.account = null;
        this.command = null;
        this.response = null;
        this.timer = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        if (verbose) {
            console.debug("New EmailRequest:", moduleCID, this.controller.CID, this.id);
        }
    }

    send(account, command, body, timeout = DEFAULT_TIMEOUT) {
        if (verbose) {
            console.debug("send:", account, command, body, timeout, this);
        }
        return new Promise((resolve, reject) => {
            try {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
                this.account = account;
                this.command = command;
                if (body === undefined || body === null || body === "") {
                    this.body = "{}";
                } else if (typeof body === "string") {
                    this.body = body;
                } else {
                    this.body = JSON.stringify(body, null, 2);
                }

                if (timeout !== NO_TIMEOUT) {
                    this.timer = setTimeout(() => {
                        this.reject(new Error("request timeout:", this));
                    }, timeout);
                }

                this.controller.pendingRequests.set(this.id, this).then(() => {
                    if (logQueue) {
                        console.log("send: pushed to pendingRequests:", this.id, this);
                    }
                    this.controller.sendmail(this).then((sent) => {
                        if (verbose) {
                            console.debug("sendmail returned:", sent);
                        }
                    });
                });
            } catch (e) {
                this.reject(e);
            }
        });
    }

    remove() {
        try {
            if (verbose) {
                console.debug("remove:", this);
            }

            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }

            this.controller.pendingRequests.pop(this.id).then((request) => {
                if (request) {
                    if (logQueue) {
                        console.log("remove: popped from pendingRequests:", this.id, request);
                    }
                    console.assert(this.id === request.id, "remove: sanity check failed: request id mismatch", this, request);
                }
                this.controller.pendingResponses.pop(this.id).then((response) => {
                    if (response) {
                        if (logQueue) {
                            console.log("remove: popped from pendingResponses:", this.id, response);
                        }
                        console.assert(
                            this.id === this.getBodyRequest(response),
                            "remove: sanity check failed: response id mismatches body request field",
                            this,
                            response,
                        );
                    }
                });
            });
        } catch (e) {
            console.error(e);
        }
    }

    reject(error) {
        console.warn("reject:", this);
        this.remove();
        this.rejectPromise(error);
    }

    // FIXME: remove parameters from resolve -- they are only for sanity checks
    resolve(request, response) {
        try {
            console.assert(this === request, "resolve: request not this", request, this);
            console.assert(!differ(response, this.response), "resolve: response differs from this.response", response, this.response);

            if (verbose) {
                console.debug("resolve:", this, this.response);
            }
            if (this.response) {
                // push this id to resolvedRequests for duplicate response detection
                this.controller.resolvedRequests.set(this.id, true).then(() => {
                    if (logQueue) {
                        console.log("resolve: pushed to resolvedRequests:", this.id, true);
                    }
                    this.remove();
                    this.resolvePromise(this.response);
                });
            } else {
                this.reject(new Error("resolved with null response", this));
            }
        } catch (e) {
            this.rejectPromise(e);
        }
    }
}

class EmailController {
    constructor() {
        try {
            this.CID = "controller-" + generateUUID();
            this.pendingRequests = new AsyncMap(); // active requests		    key: UUID	    value: EmailRequest
            this.pendingResponses = new AsyncMap(); // unmatched received responses	    key: requestId  value: response body data
            this.processedMessages = new AsyncMap(); // messages already processed	    key: Message-ID value: requestId
            this.resolvedRequests = new AsyncMap(); // requests already resolved	    key: requestID  value: bool
            if (verbose) {
                console.debug("New EmailController:", moduleCID, this.CID);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async startup() {
        try {
            this.responseCheckTimer = setInterval(() => {
                this.checkPending();
            }, RESPONSE_CHECK_INTERVAL);
            if (verbose) {
                console.debug("EmailController: startup", this.CID);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async shutdown() {
        try {
            if (verbose) {
                console.debug("EmailController: shutdown", this.CID);
            }
            if (this.responseCheckTimer) {
                clearInterval(this.responseCheckTimer);
                this.responseCheckTimer = null;
            }
        } catch (e) {
            console.error(e);
        }
    }

    safeParseJSON(body) {
        try {
            return JSON.parse(body);
        } catch (e) {
            console.warn(e);
            return undefined;
        }
    }

    stripMessageId(messageId) {
        try {
            return messageId.replace(/^<|>$/g, "");
        } catch (e) {
            console.error(e);
        }
    }

    getBodyRequest(request) {
        try {
            var value = request.request;
            if (value === undefined) {
                value = request.Request;
            }
            return value;
        } catch (e) {
            console.error(e);
        }
    }

    async logQueueState(label) {
        try {
            const requests = await this.pendingRequests.size();
            const responses = await this.pendingResponses.size();
            const processed = await this.processedMessages.size();
            const resolved = await this.resolvedRequests.size();
            console.info(label, {
                module: moduleCID,
                email: this.CID,
                requests: requests,
                responses: responses,
                processed: processed,
                resolved: resolved,
                pendingRequests: await this.pendingRequests.keys(),
                pendingResponses: await this.pendingResponses.keys(),
                processedMessages: await this.processedMessages.keys(),
                resolvedRequests: await this.resolvedRequests.keys(),
            });
        } catch (e) {
            console.error(e);
        }
    }

    async checkPending() {
        try {
            const requestCount = await this.pendingRequests.size();
            const responseCount = await this.pendingResponses.size();

            if (verbose || logQueue) {
                if (requestCount > 0 || responseCount > 0) {
                    await this.logQueueState("checkPending:");
                }
            }

            if (responseCount > 0) {
                // check for pending messages with responses available, returning list of requests found
                const found = await this.pendingRequests.scan((key, value) => {
                    return this.checkPendingRequest(key, value);
                });
                for (const [requestId, request] of found.entries()) {
                    console.assert(
                        !(await this.pendingResponses.has(requestId)),
                        "checkPending: scan result requestId still present in this.pendingResponses",
                        requestId,
                        request,
                    );
                    request.resolve(request, request.response);
                }

                // check for expired responses
                const expiredResponses = await this.pendingResponses.expire(RESPONSE_EXPIRE_SECONDS);
                for (const [responseId, response] of expiredResponses.entries()) {
                    console.error("checkPending: response expired:", responseId, response);
                    if (logQueue) {
                        console.log("checkPending: expired from this.pendingResponses:", responseId, response);
                    }
                    console.assert(
                        !(await this.pendingResponses.has(responseId)),
                        "responseId still found in this.pendingResponses after expire",
                        responseId,
                        response,
                    );
                }
            }

            // FIXME: check here for expired this.resolvedRequests and this.processedMessages on a long timeout
        } catch (e) {
            console.error(e);
        }
    }

    // When a pendingRequest has a matching pendingResponse:
    //  - pop the response from this.pendingResponses
    //  - set the response data in the request object
    //  - include the request in the scan return data
    //  Note: the scan function runs with a lock on the scanned AsyncMap
    async checkPendingRequest(requestId, request) {
        try {
            console.assert(requestId === request.id, "sanity check failed", requestId, request);
            const response = await this.pendingResponses.pop(requestId);
            if (response) {
                if (logQueue) {
                    console.log("checkPendingRequest: popped from this.pendingResponses:", requestId, response);
                }
                console.assert(
                    requestId === this.getBodyRequest(response),
                    "sanity check failed: requestId mismatches response body request field",
                    requestId,
                    request,
                    response,
                );
                if (verbose) {
                    console.debug("checkPendingRequest: response found, setting response in request");
                }
                request.response = response;
                return true;
            } else {
                return false;
            }
        } catch (e) {
            console.error(e);
        }
    }

    async minimizeComposeWindow(composer) {
        try {
            await messenger.windows.update(composer.windowId, { state: "minimized" });
        } catch (e) {
            console.error(e);
        }
    }

    async sendmail(request) {
        try {
            if (verbose) {
                console.debug("sendmail:", request);
            }
            console.assert(await this.pendingRequests.has(request.id), "sanity check: id should be pending");
            const identity = request.account.identities[0];
            const domain = domainPart(identity.email);
            const msg = {
                identityId: identity.id,
                to: ["filterctl@" + domain],
                from: identity.name + " <" + identity.email + ">",
                subject: request.command,
                isPlainText: true,
                plainTextBody: request.body,
                customHeaders: [{ name: "X-Filterctl-Request-Id", value: request.id }],
            };

            const comp = await messenger.compose.beginNew();
            if (verbose) {
                console.debug("sendmail: comp:", comp);
            }
            if (request.minimizeCompose) {
                await this.minimizeComposeWindow(comp);
            }

            const details = await messenger.compose.getComposeDetails(comp.id);
            if (verbose) {
                console.debug("getComposeDetails:", details);
                console.debug("calling setComposeDetails:", comp.id, msg);
            }
            await messenger.compose.setComposeDetails(comp.id, msg);
            if (verbose) {
                console.debug("setComposeDetails returned");
                console.debug("calling sendMessage:", comp.id);
            }
            const sent = await messenger.compose.sendMessage(comp.id);
            if (verbose) {
                console.debug("sendMessage returned:", sent);
            }
            if (await config.local.getBool(config.key.autoDelete)) {
                for (const message of sent.messages) {
                    await this.deleteMessage(message);
                }
            }
            await this.checkPending();
            return sent;
        } catch (e) {
            console.error(e);
        }
    }

    async getMessageBody(message) {
        try {
            const fullMessage = await messenger.messages.getFull(message.id);
            for (const part of fullMessage.parts) {
                if (part.contentType === "text/plain") {
                    const body = part.body;
                    if (verbose) {
                        console.debug("body:", body);
                    }
                    return body;
                }
            }
            throw new Error("failed to find message body:", message);
        } catch (e) {
            console.error(e);
        }
    }

    async getMessageHeaders(message) {
        try {
            const fullMessage = await messenger.messages.getFull(message.id);
            return fullMessage.headers;
        } catch (e) {
            console.error(e);
        }
    }

    async deleteMessage(message) {
        try {
            if (verbose) {
                console.debug("deleteMessage:", message.folder.id, message);
            }
            await messenger.messages.delete([message.id]);
        } catch (e) {
            console.error(e);
        }
    }

    async receive(folder, messageList) {
        try {
            if (verbose) {
                console.debug("receive:", folder, messageList);
            }
            let count = 0;
            for (const message of messageList.messages) {
                if (verbose) {
                    console.debug("receive: message[" + count + "]:", message);
                }
                count++;
                if (message.subject === "filterctl response") {
                    const headers = await this.getMessageHeaders(message);
                    let requestId = null;
                    if (await this.processedMessages.has(message.headerMessageId)) {
                        let pmRequest = await this.processedMessages.get(message.headerMessageId);
                        let pmBody = await this.getMessageBody(message);
                        var pmResponse = this.safeParseJSON(pmBody);
                        if (verbose) {
                            console.debug("receive: Message-Id has been processed, discarding duplicate 'new' message:", {
                                processedMessagesKey: message.headerMessageId,
                                processedMessagesValue: pmRequest,
                                responseBody: pmResponse,
                                headers: headers,
                                message: message,
                            });
                        }
                        if (logQueue) {
                            await this.logQueueState("receive: Message-ID in this.processedMessages:");
                        }
                    } else {
                        // this header contains the message-id of the request email message
                        requestId = this.stripMessageId(headers["x-filterctl-request-id"][0]);
                        if (!requestId) {
                            console.error("filterctl response message has no requestId:", message, headers);
                        }
                    }

                    if (requestId) {
                        if (verbose) {
                            console.debug("receive: new response received:", {
                                requestId: requestId,
                                message: message,
                                headers: headers,
                            });
                        }

                        if (message.read) {
                            console.error("receive: message has already been read:", message);
                        }

                        var body = await this.getMessageBody(message);
                        var response = this.safeParseJSON(body);

                        console.assert(
                            this.getBodyRequest(response) === requestId,
                            "receive: response header mismatches body request field:",
                            {
                                requestID: requestId,
                                response: response,
                                message: message,
                                headers: headers,
                            },
                        );

                        // save this messageId for duplicate detection
                        await this.processedMessages.set(message.headerMessageId, requestId);
                        if (logQueue) {
                            console.log("receive: pushed to processedMessages:", message.headerMessageId, requestId);
                        }

                        let alreadyResolved = await this.resolvedRequests.get(requestId);
                        if (alreadyResolved === true) {
                            if (verbose) {
                                console.debug("receive: requestID has already been resolved, discarding 'new' message", {
                                    requestId: requestId,
                                    message: message,
                                    headers: headers,
                                    response: response,
                                });
                            }
                            if (logQueue) {
                                await this.logQueueState("receive: requestId in this.resolvedRequests:");
                            }
                        } else {
                            // not already resolved, check if there's a pending request
                            let request = await this.pendingRequests.get(requestId);
                            if (request !== undefined) {
                                if (verbose) {
                                    console.debug("receive: pending request found, resolving", requestId, request, response);
                                }
                                request.response = response;
                                request.resolve(request, response);
                            } else {
                                await this.pendingResponses.set(requestId, response);
                                if (logQueue) {
                                    console.log("receive: pushed to pendingResponses:", requestId, response);
                                }
                            }
                        }
                    }

                    // autodelete filterctl response messages with any requestId
                    if (await config.local.getBool(config.key.autoDelete)) {
                        await this.deleteMessage(message);
                    }

                    // do a check without waiting for the timer
                    await this.checkPending();
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    async sendRequest(account, command, body = undefined, timeout = undefined) {
        try {
            if (verbose) {
                console.log("email.sendRequest:", account, command, body, timeout);
            }
            const autoDelete = await config.local.getBool(config.key.autoDelete);
            const minimizeCompose = await config.local.getBool(config.key.minimizeCompose);

            let request = new EmailRequest(this, autoDelete, minimizeCompose);
            var ret = await request.send(account, command, body, timeout);
            if (verbose) {
                console.log("sendEmailRequest returning:", ret);
            }
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    async onBeforeUnload() {
        try {
            await messenger.messages.onNewMailReceived.removeListener(this.receive);
        } catch (e) {
            console.error(e);
        }
    }
}

/*
async function onComposeStateChange(tab, state) {
    console.log("composeStateChanged:", tab, state);
}
messenger.compose.onComposeStateChanged.addListener(onComposeStateChange);
*/

export const email = new EmailController();

async function receiver(folder, messageList) {
    await email.receive(folder, messageList);
}

async function startup() {
    await email.startup();
    await messenger.messages.onNewMailReceived.addListener(receiver);
}

async function shutdown() {
    await messenger.messages.onNewMailReceived.removeListener(receiver);
    await email.shutdown();
}

window.addEventListener("load", startup);
window.addEventListener("beforeunload", shutdown);

/*
async function onNewMailReceived(folder, messageList) {
    try {
    } catch(e) {
	console.error(e);
    }
}


window.addEventListener("beforeunload", () => {
    messenger.messages.onNewMailReceived.removeListener(onNewMailReceived);
    email.shutdown();
});
*/
