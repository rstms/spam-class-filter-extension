import { generateUUID } from "./common.js";
import { domainPart } from "./common.js";
import { AsyncMap } from "./asyncmap.js";
import { config } from "./config.js";

/* global console, messenger, setTimeout, clearTimeout, setInterval, clearInterval, window */

const verbose = false;
const logQueue = true;

const DEFAULT_TIMEOUT = 60 * 1024;
const NO_TIMEOUT = 0;

const RESPONSE_EXPIRE_SECONDS = 60;

var pendingRequests = new AsyncMap(); // active requests		    key: UUID	    value: EmailRequest
var pendingResponses = new AsyncMap(); // unmatched received responses	    key: requestId  value: response body data
var processedMessages = new AsyncMap();
var resolvedRequests = new AsyncMap();

const RESPONSE_CHECK_INTERVAL = 1024;
var responseCheckTimer = null;

class EmailRequest {
    constructor(autoDelete, minimizeCompose) {
        console.log("autoDelete:", autoDelete);
        console.log("minimizeCompose:", minimizeCompose);
        this.id = generateUUID();
        this.autoDelete = autoDelete;
        this.minimizeCompose = minimizeCompose;
        this.account = null;
        this.command = null;
        this.response = null;
        this.timer = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
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

                pendingRequests.set(this.id, this).then(() => {
                    if (logQueue) {
                        console.log("send: added to pendingRequests:", this.id, this);
                    }
                    sendmail(this).then((sent) => {
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
            console.log("remove:", this);

            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }

            pendingRequests.pop(this.id).then((request) => {
                if (request) {
                    if (logQueue) {
                        console.log("remove: popped from pendingRequests:", this.id, request);
                    }
                    console.assert(this.id === request.id, "remove: sanity check failed: request id mismatch", this, request);
                }
                pendingResponses.pop(this.id).then((response) => {
                    if (response) {
                        if (logQueue) {
                            console.log("remove: popped from pendingResponses:", this.id, response);
                        }
                        console.assert(
                            this.id === getBodyRequest(response),
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

    resolve() {
        try {
            if (verbose) {
                console.log("resolve:", this, this.response);
            }
            if (this.response) {
                resolvedRequests.set(this.id, true).then(() => {
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

async function checkPending() {
    try {
        const responseCount = await pendingResponses.size();

        if (verbose) {
            if ((await pendingRequests.size()) > 0 || responseCount > 0) {
                console.debug("checkPending:", {
                    requests: await pendingRequests.keys(),
                    responses: await pendingResponses.keys(),
                });
            }
        }

        if (responseCount > 0) {
            // check for pending messages with responses available
            const found = await pendingRequests.scan(checkPendingRequest);
            for (const [requestId, request] of found.entries()) {
                console.assert(
                    !(await pendingResponses.has(requestId)),
                    "checkPending: scan result requestId still present in pendingResponses",
                    requestId,
                    request,
                );
                request.resolve();
            }

            // check for expired responses
            const expiredResponses = await pendingResponses.expire(RESPONSE_EXPIRE_SECONDS);
            for (const [responseId, response] of expiredResponses.entries()) {
                console.error("checkPending: response expired:", responseId, response);
                // TODO: maybe scan pendingMessages for responseID?
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// When a pendingRequest has a matching pendingResponse:
//  - pop the response from pendingResponses
//  - set the response data in the request object
//  - include the request in the scan return data
//  Note: the scan function runs with a lock on the scanned AsyncMap
async function checkPendingRequest(requestId, request) {
    try {
        console.assert(requestId === request.id, "sanity check failed", requestId, request);
        const response = await pendingResponses.pop(requestId);
        if (response) {
            if (logQueue) {
                console.log("checkPendingRequest: popped from pendingResponses:", requestId, response);
            }
            console.assert(
                requestId === getBodyRequest(response),
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

async function minimizeComposeWindow(composer) {
    try {
        await messenger.windows.update(composer.windowId, { state: "minimized" });
    } catch (e) {
        console.error(e);
    }
}

async function sendmail(request) {
    try {
        if (verbose) {
            console.debug("sendmail:", request);
        }
        console.assert(await pendingRequests.has(request.id), "sanity check: id should be pending");
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
            await minimizeComposeWindow(comp);
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
        if (await config.local.get("autoDelete")) {
            for (const message of sent.messages) {
                await deleteMessage(message);
            }
        }
        await checkPending();
        return sent;
    } catch (e) {
        console.error(e);
    }
}

async function getMessageBody(message) {
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

export async function getMessageHeaders(message) {
    try {
        const fullMessage = await messenger.messages.getFull(message.id);
        return fullMessage.headers;
    } catch (e) {
        console.error(e);
    }
}

function safeParseJSON(body) {
    try {
        return JSON.parse(body);
    } catch (e) {
        console.warn(e);
        return undefined;
    }
}

async function deleteMessage(message) {
    try {
        if (verbose) {
            console.debug("deleteMessage:", message.folder.id, message);
        }
        await messenger.messages.delete([message.id]);
    } catch (e) {
        console.error(e);
    }
}

function stripMessageId(messageId) {
    return messageId.replace(/^<|>$/g, "");
}

function getBodyRequest(request) {
    var value = request.request;
    if (value === undefined) {
        value = request.Request;
    }
    return value;
}

async function receive(folder, messageList) {
    try {
        for (const message of messageList.messages) {
            if (verbose) {
                console.debug("receive: message received:", message);
            }

            if (message.subject === "filterctl response") {
                const headers = await getMessageHeaders(message);
                let requestId = null;
                if (await processedMessages.has(message.headerMessageId)) {
                    console.warn("receive: Message-Id has been processed, discarding duplicate 'new' message:", message);
                } else {
                    // this header contains the message-id of the request email message
                    requestId = stripMessageId(headers["x-filterctl-request-id"][0]);
                    if (!requestId) {
                        console.error("filterctl response message has no requestId:", message, headers);
                    }
                }

                if (requestId) {
                    if (verbose) {
                        console.log("receive: new response received:", { requestId: requestId, message: message, headers: headers });
                    }

                    if (message.read) {
                        console.error("receive: message has already been read:", message);
                    }

                    var body = await getMessageBody(message);
                    var response = safeParseJSON(body);

                    console.assert(getBodyRequest(response) === requestId, "receive: response header mismatches body request field:", {
                        requestID: requestId,
                        response: response,
                        message: message,
                        headers: headers,
                    });

                    // add the response message-id to the body data structure
                    // response.Response = stripMessageId(headers["message-id"][0]);

                    // save this messageId for duplicate detection
                    await processedMessages.set(message.headerMessageId, requestId);

                    if (await resolvedRequests.has(requestId)) {
                        console.warn("receive: requestID has already been resolved, discarding 'new' message", {
                            requestId: requestId,
                            message: message,
                            headers: headers,
                            response: response,
                        });
                        continue;
                    }

                    // autodelete filterctl response messages with any requestId
                    if (await config.local.get("autoDelete")) {
                        await deleteMessage(message);
                    }

                    await pendingResponses.set(requestId, response);
                    if (logQueue) {
                        console.log("receive: added to pendingResponses:", requestId, response);
                    }
                }
                // do a check without waiting for the timer
                await checkPending();
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleLoad() {
    messenger.messages.onNewMailReceived.addListener(receive);
    responseCheckTimer = setInterval(checkPending, RESPONSE_CHECK_INTERVAL);
}

async function handleUnload() {
    messenger.messages.onNewMailReceived.removeListener(receive);
    if (responseCheckTimer) {
        clearInterval(responseCheckTimer);
        responseCheckTimer = null;
    }
}

export async function sendEmailRequest(account, command, body = undefined, timeout = undefined) {
    try {
        const autoDelete = await config.local.get("autoDelete");
        const minimizeCompose = await config.local.get("minimizeCompose");

        let request = new EmailRequest(autoDelete, minimizeCompose);
        if (verbose) {
            console.log("sendEmailRequest:", account, command, body, timeout);
            console.log("sendEmailRequest: config:", config);
        }
        var ret = await request.send(account, command, body);
        if (verbose) {
            console.log("sendEmailRequest returning:", ret);
        }
        return ret;
    } catch (e) {
        console.error(e);
    }
}

/*
async function onComposeStateChange(tab, state) {
    console.log("composeStateChanged:", tab, state);
}
messenger.compose.onComposeStateChanged.addListener(onComposeStateChange);
*/

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);
