import { generateUUID } from "./common.js";
import { domainPart } from "./common.js";
import { AsyncMap } from "./asyncmap.js";

/* global console, messenger, setTimeout, clearTimeout, setInterval, clearInterval, window */

const verbose = true;

const DEFAULT_TIMEOUT = 15 * 1024;
const NO_TIMEOUT = 0;

const RESPONSE_CHECK_INTERVAL = 1024;
const RESPONSE_EXPIRE_SECONDS = 3;
const MESSAGE_EXPIRE_SECONDS = 5;

var pendingRequests = {};
var pendingMessages = new AsyncMap();
var pendingResponses = new AsyncMap();
var responseCheckTimer = null;

class EmailRequest {
    constructor() {
        this.id = generateUUID();
        this.account = null;
        this.command = null;
        this.options = null;
        this.requestID = null;
        this.timer = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    send(account, command, options, timeout = DEFAULT_TIMEOUT) {
        if (verbose) {
            console.debug("send:", account, command, options, timeout);
        }
        return new Promise((resolve, reject) => {
            try {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
                this.account = account;
                this.command = command;
                this.options = options;
                if (timeout !== NO_TIMEOUT) {
                    this.timer = setTimeout(() => {
                        this.reject(new Error("request timeout:", this));
                    }, timeout);
                }
                pendingRequests[this.id] = this;
                sendmail(this).then((sent) => {
                    if (verbose) {
                        console.debug("sendmail returned:", sent);
                    }
                    if (sent.headerMessageId) {
                        this.requestID = sent.headerMessageId;
                        console.log("adding to pendingMessages:", sent.headerMessageId);
                        pendingMessages.set(sent.headerMessageId, this).then(() => {
                            console.log("added to pendingMessages:", sent.headerMessageId);
                        });
                    } else {
                        this.reject(new Error("sendmail return value has no headerMessageId:", sent));
                    }
                });

                pendingResponses.pop(this.requestID).then((response) => {
                    if (response) {
                        if (verbose) {
                            console.log("pending response found immediately, resolving:", response);
                        }
                        this.resolve(response);
                    }
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
            delete pendingRequests[this.id];
            if (this.requestId) {
                pendingMessages.pop(this.requestId).then((item) => {
                    if (item) {
                        console.log("removed from pendingMessages:", this.requestId, item);
                    }
                });
                pendingResponses.pop(this.requestId).then((item) => {
                    if (item) {
                        console.log("removed from pendingResponses:", this.requestId, item);
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    reject(error) {
        this.remove();
        this.rejectPromise(error);
    }

    resolve(response = undefined) {
        try {
            this.remove();
            if (verbose) {
                console.debug("resolving email response:", response);
            }
            this.resolvePromise(response);
        } catch (e) {
            this.rejectPromise(e);
        }
    }
}

async function checkPendingResponses() {
    try {
        const messageCount = await pendingMessages.size();
        const responseCount = await pendingResponses.size();

        if (verbose) {
            const requestCount = pendingRequests.length;
            if (requestCount > 0 || messageCount > 0 || responseCount > 0) {
                console.debug(
                    "pendingRequests:",
                    pendingRequests.length,
                    " pendingMessages:",
                    messageCount,
                    " pendingResponses:",
                    responseCount,
                );
            }
        }

        if (responseCount) {
            const found = await pendingResponses.scan(checkResponse);
            for (const [responseId, response] of found.entries()) {
                const resolver = await pendingMessages.pop(responseId);
                if (resolver) {
                    if (verbose) {
                        console.debug("response returned from pendingMessages scan, resolving:", responseId, response);
                    }
                    resolver.resolve(response);
                } else {
                    throw new Error(
                        "response returned from pendingResponses scan but not present in pendingMessages:",
                        responseId,
                        response,
                    );
                }
            }

            const expiredResponses = await pendingResponses.expire(RESPONSE_EXPIRE_SECONDS);
            for (const [responseId, response] of expiredResponses.entries()) {
                console.error("response expired:", responseId, response);
            }
        }

        if (messageCount) {
            const expiredMessages = await pendingMessages.expire(MESSAGE_EXPIRE_SECONDS);
            for (const [messageId, request] of expiredMessages.entries()) {
                console.error("message expired:", messageId, request);
                request.reject(new Error("filterctl response timed out:", messageId));
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function checkResponse(responseID, response) {
    try {
        var ret = false;
        if (await pendingMessages.has(responseID)) {
            ret = true;
        }
        if (verbose) {
            console.debug("checkResponse:", responseID, ret, response);
        }
        return ret;
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
        };
        const comp = await messenger.compose.beginNew();
        const details = await messenger.compose.getComposeDetails(comp.id);
        if (verbose) {
            console.debug("details:", details);
        }
        await messenger.compose.setComposeDetails(comp.id, msg);
        if (verbose) {
            console.debug("setComposeDetails returned");
        }
        const sent = await messenger.compose.sendMessage(comp.id);
        if (verbose) {
            console.debug("sendmail returning:", sent);
        }
        return sent;
    } catch (e) {
        console.error(e);
    }
}

export async function sendEmailRequest(account, command, options = {}, timeout = undefined) {
    try {
        let request = new EmailRequest();
        console.log("sendEmailRequest:", account, command, options, timeout);
        var ret = await request.send(account, command, options, timeout);
        console.log("sendEmailRequest returning:", ret);
        return ret;
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

async function handleNewMail(folder, messageList) {
    try {
        for (const message of messageList.messages) {
            if (verbose) {
                console.debug("message received:", message);
            }
            if (message.subject === "filterctl response") {
                const messageID = message.headerMessageId;
                const headers = await getMessageHeaders(message);
                var requestID = headers["x-filterctl-response-id"][0];
                requestID = requestID.replace(/^<|>$/g, "");
                if (verbose) {
                    console.debug("messageID:", messageID);
                    console.debug("requestID:", requestID);
                }
                if (requestID) {
                    var body = await getMessageBody(message);
                    var response = safeParseJSON(body);
                    const resolver = await pendingMessages.pop(requestID);
                    if (resolver) {
                        if (verbose) {
                            console.debug("requestID found in pendingMessages, resolving:", requestID, response);
                        }
                        resolver.resolve(response);
                    } else {
                        if (verbose) {
                            console.debug(
                                "requestID not present in pendingMessages, setting to pendingResponses:",
                                requestID,
                                response,
                            );
                        }
                        await pendingResponses.set(requestID, response);
                    }
                } else {
                    console.warn("filterctl response message has no requestID:", message);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleLoad() {
    messenger.messages.onNewMailReceived.addListener(handleNewMail);
    responseCheckTimer = setInterval(checkPendingResponses, RESPONSE_CHECK_INTERVAL);
}

async function handleUnload() {
    messenger.messages.onNewMailReceived.removeListener(handleNewMail);
    if (responseCheckTimer) {
        clearInterval(responseCheckTimer);
        responseCheckTimer = null;
    }
}

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);
