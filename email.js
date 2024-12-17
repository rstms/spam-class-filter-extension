import { domainPart } from "./common.js";

/* globals messenger, console, setTimeout, clearTimeout  */
const verbose = false;

const EMAIL_REQUEST_TIMEOUT = 1024 * 10;

async function sendFilterControlMessage(account, subject) {
    try {
        const identity = account.identities[0];
        const domain = domainPart(identity.email);
        const msg = {
            identityId: identity.id,
            to: ["filterctl@" + domain],
            from: identity.name + " <" + identity.email + ">",
            subject: subject,
            isPlainText: true,
        };
        if (verbose) {
            console.log("sendFilterControlMessage:", msg);
        }
        const comp = await messenger.compose.beginNew();
        const details = await messenger.compose.getComposeDetails(comp.id);
        if (verbose) {
            console.log("details:", details);
        }
        await messenger.compose.setComposeDetails(comp.id, msg);
        const ret = await messenger.compose.sendMessage(comp.id);
        if (verbose) {
            console.log("messenger.compose.sendMessage returned:", ret);
        }
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
                    console.log("body:", body);
                }
                return body;
            }
        }
        throw new Error("failed to find message body:", message);
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

export function sendEmailRequest(account, command, options = {}) {
    if (verbose) {
        console.log("sendEmailRequest:", account, command);
    }
    return new Promise((resolve, reject) => {
        var timer = null;
        var handler = null;
        try {
            async function handleNewMailReceived(folder, messageList) {
                try {
                    if (verbose) {
                        console.log("handleNewMail[" + account.id + "] messages:", messageList.messages.length);
                    }
                    for (const message of messageList.messages) {
                        if (message.subject === "filterctl response" && message.folder.accountId === account.id) {
                            clearTimeout(timer);
                            messenger.messages.onNewMailReceived.removeListener(handler);
                            if (verbose) {
                                console.log("filterctl response:", message);
                            }
                            var response = {
                                command: command,
                                accountId: account.id,
                                body: await getMessageBody(message),
                            };
                            if (options.autoDelete) {
                                await messenger.messages.delete([message.id], true);
                                if (verbose) {
                                    console.log("deleted: ", message.id);
                                }
                            }
                            response.json = safeParseJSON(response.body);
                            resolve(response);
                        }
                    }
                } catch (e) {
                    clearTimeout(timer);
                    messenger.messages.onNewMailReceived.removeListener(handler);
                    reject(e);
                }
            }

            handler = handleNewMailReceived;
            messenger.messages.onNewMailReceived.addListener(handler);
            timer = setTimeout(() => {
                messenger.messages.onNewMailReceived.removeListener(handler);
                reject(new Error("email response timeout"));
            }, EMAIL_REQUEST_TIMEOUT);

            sendFilterControlMessage(account, command).then((sent) => {
                if (options.autoDelete) {
                    const messageId = sent.messages[0].id;
                    messenger.messages.delete([messageId], true).then(() => {
                        if (verbose) {
                            console.log("deleted: ", messageId);
                        }
                    });
                }
            });
        } catch (e) {
            if (handler) {
                messenger.messages.onNewMailReceived.removeListener(handler);
            }
            clearTimeout(timer);
            reject(e);
        }
    });
}
