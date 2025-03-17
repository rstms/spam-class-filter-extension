import { generateUUID } from "./common.js";
import { domainPart } from "./common.js";
import { AsyncMap } from "./asyncmap.js";
import { config } from "./config.js";

/* global console, messenger, setTimeout, clearTimeout, setInterval, clearInterval, window */

const verbose = true;
const logQueue = true;

const DEFAULT_TIMEOUT = 15 * 1024;
const NO_TIMEOUT = 0;

const RESPONSE_EXPIRE_SECONDS = 30;
const MESSAGE_EXPIRE_SECONDS = 30;

var pendingRequests = new AsyncMap(); // active requests		    key: UUID	    value: EmailRequest
var pendingMessages = new AsyncMap(); // sent messages awaiting response    key: UUID	    value: EmailRequest
var pendingResponses = new AsyncMap(); // unmatched received responses	    key: requestId  value: response body data

const RESPONSE_CHECK_INTERVAL = 1024;
var responseCheckTimer = null;

class EmailRequest {
    constructor(autoDelete) {
        this.id = generateUUID();
        this.autoDelete = autoDelete;
        this.account = null;
        this.command = null;
        this.requestId = null;
        this.responseId = null;
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
                this.body = JSON.stringify(body ? body : "", null, 2);

                if (timeout !== NO_TIMEOUT) {
                    this.timer = setTimeout(() => {
                        this.reject(new Error("request timeout:", this));
                    }, timeout);
                }

                pendingRequests.set(this.id, this).then(() => {
                    if (logQueue) {
                        console.log("send: added to pendingRequests:", { id: this.id, request: this });
                    }
                    sendmail(this).then((sent) => {
                        if (verbose) {
                            console.debug("sendmail returned:", sent);
                        }
                        if (sent.headerMessageId) {
                            this.requestId = sent.headerMessageId;
                            if (logQueue) {
                                console.debug("send: adding to pendingMessages:", sent.headerMessageId);
                            }

                            pendingResponses.pop(this.requestId).then((response) => {
                                if (response) {
                                    if (logQueue) {
                                        console.log("send: popped from pendingResponses:", {
                                            requestId: this.requestId,
                                            response: response,
                                        });
                                    }
                                    if (verbose) {
                                        console.debug("response present after send, resolving:", response);
                                    }
                                    this.resolve(response);
                                } else {
                                    pendingMessages.set(this.id, this).then(() => {
                                        if (logQueue) {
                                            console.log("send: added to pendingMessages:", {
                                                requestId: this.requestId,
                                                request: this,
                                            });
                                        }
                                    });
                                }
                            });
                        } else {
                            this.reject(new Error("sendmail return value has no headerMessageId:", sent));
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
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }

            if (!this.requestId) {
                console.error("remove: missing requestID:", this);
            }

            if (!this.responseId) {
                console.error("remove: missing responseID:", this);
            }

            pendingRequests.pop(this.id).then((request) => {
                if (request) {
                    if (logQueue) {
                        console.log("remove: popped from pendingRequests:", { id: this.id, request: request });
                    }
                    if (request.id !== this.id) {
                        console.error("unexpected id mismatch:", this, request);
                    }
                } else {
                    console.error("remove: not found in pendingRequests:", this);
                }
                pendingMessages.pop(this.requestId).then((request) => {
                    if (request) {
                        if (logQueue) {
                            console.log("remove: popped from pendingMessages:", { requestId: this.requestId, request: request });
                        }
                    }
                    pendingResponses.pop(this.requestId).then((response) => {
                        if (response) {
                            if (logQueue) {
                                console.log("remove: popped from pendingResponses:", {
                                    requestId: this.requestId,
                                    response: response,
                                });
                            }
                        }
                    });
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

    resolve(response = undefined) {
        try {
            this.remove();
            if (verbose) {
                console.log("resolve: resolving response:", response);
            }
            this.resolvePromise(response);
        } catch (e) {
            this.rejectPromise(e);
        }
    }
}

async function checkPending() {
    try {
        const requestCount = await pendingRequests.size();
        const messageCount = await pendingMessages.size();
        const responseCount = await pendingResponses.size();

        if (messageCount === 0 && responseCount === 0) {
            return;
        } else {
            if (verbose) {
                console.debug("checkPending:", {
                    requests: requestCount,
                    messages: messageCount,
                    responses: responseCount,
                });
            }
        }

        if (messageCount > 0) {
            // check for pending messages with responses available
            const found = await pendingMessages.scan(checkPendingMessage);
            for (const [requestId, request] of found.entries()) {
                if (await pendingResponses.has(requestId)) {
                    console.error(
                        "pendingMessages: scan result requestId unexpectedly still present in pendingResponses",
                        requestId,
                        request,
                    );
                }
                if (request.response) {
                    request.resolve(request.response);
                } else {
                    console.error("pendingMessages: scan result has null response", requestId, request);
                }
            }

            // check for expired messages
            const expiredMessages = await pendingMessages.expire(MESSAGE_EXPIRE_SECONDS);
            for (const [messageId, request] of expiredMessages.entries()) {
                console.error("checkPending: request expired:", messageId, request);
                request.reject(new Error("timeout awaiting command response:", request));
            }
        }

        if (responseCount > 0) {
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

// When a pendingMessage has a matching pendingResponse:
//  - pop the response from pendingResponses
//  - set the response data in the pendingMessage request object
//  - include requestId: request in the scan return data
//  Note: the scan function runs with a lock on the scanned AsyncMap
async function checkPendingMessage(requestId, request) {
    try {
        const response = await pendingResponses.pop(requestId);
        if (response) {
            if (logQueue) {
                console.log("checkPendingMessage: popped pendingResponses:", { requestId: requestId, response: response });
            }
            if (verbose) {
                console.debug("checkPendingMessage: response found, setting responseID, response in request");
            }
            request.responseId = stripMessageId(response.Response);
            request.response = response;
            return true;
        }
        return false;
    } catch (e) {
        console.error(e);
    }
}

async function sendmail(request) {
    try {
        if (verbose) {
            console.debug("sendmail:", request);
        }
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
        let autoDelete = await config.local.get("autoDelete");
        if (autoDelete) {
            for (const message of sent.messages) {
                deleteMessage(message);
            }
        }
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

async function getMessageHeaders(message) {
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

async function receive(folder, messageList) {
    try {
        for (const message of messageList.messages) {
            if (verbose) {
                console.debug("receive: message received:", message);
            }
            if (message.subject === "filterctl response") {
                const headers = await getMessageHeaders(message);

                // this header contains the message-id of the request email message
                var requestId = stripMessageId(headers["x-filterctl-request-id"][0]);

                if (requestId) {
                    if (verbose) {
                        console.log("receive: new response received:", { requestId: requestId, message: message, headers: headers });
                    }

                    if (message.read) {
                        console.error("receive: message has already been read:", message);
                    }

                    var body = await getMessageBody(message);
                    var response = safeParseJSON(body);

                    if (response.Request !== requestId) {
                        console.error("receive: response header mismatches body Request:", requestId, response, message, headers);
                    }

                    // add the response message-id to the body data structure
                    // response.Response = stripMessageId(headers["message-id"][0]);

                    const request = await pendingMessages.pop(requestId);
                    if (request) {
                        if (logQueue) {
                            console.log("receive: popped from pendingMessages:", { requestID: requestId, request: request });
                        }
                        request.resolve(response);
                    } else {
                        await pendingResponses.set(requestId, response);
                        if (logQueue) {
                            console.log("receive: added to pendingResponses:", { requestId: requestId, response: response });
                        }
                    }
                } else {
                    console.warn("filterctl response message has no requestId:", message, headers);
                }
                const autoDelete = await config.local.get("autoDelete");
                if (autoDelete) {
                    await deleteMessage(message);
                }
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
        let autoDelete = await config.local.get("autoDelete");
        let request = new EmailRequest(autoDelete);
        if (verbose) {
            console.log("sendEmailRequest:", account, command, body, timeout, autoDelete);
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

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);
