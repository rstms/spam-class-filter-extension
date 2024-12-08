import { domainPart } from "./common.js";

var themeHook = null;

export function setThemeHook(func) {
    themeHook = func;
}

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
        console.log("sending FilterControl Email:", msg);
        const comp = await browser.compose.beginNew();
        const details = await browser.compose.getComposeDetails(comp.id);
        if (themeHook) {
            await themeHook();
        }
        await browser.compose.setComposeDetails(comp.id, msg);
        const ret = await browser.compose.sendMessage(comp.id);
        console.log("compose.sendMessage returned:", ret);
    } catch (e) {
        console.error(e);
    }
}

async function getMessageBody(message) {
    try {
        const fullMessage = await messenger.messages.getFull(message.id);
        for (const part of fullMessage.parts) {
            if (part.contentType === "text/plain") {
                await messenger.messages.delete([message.id], true);
                return part.body;
            }
        }
        throw new Error("failed to find message body:", message);
    } catch (e) {
        console.error(e);
    }
}

export function sendEmailRequest(account, command) {
    //console.log("sendEmailRequest:", account, command);
    return new Promise((resolve, reject) => {
        function removeListener() {
            try {
                browser.messages.onNewMailReceived.removeListener(handleNewMail);
            } catch (error) {
                console.error("removeListener failed:", error);
            }
        }

        function handleNewMail(folder, messageList) {
            try {
                console.log("handleNewMail[" + account.id + "] messages:", messageList.messages.length);
                for (const message of messageList.messages) {
                    if (message.subject === "filterctl response" && message.folder.accountId === account.id) {
                        console.log("filterctl response:", message);
                        removeListener();
                        var response = {
                            command: command,
                            accountId: account.id,
                        };

                        getMessageBody(message).then((body) => {
                            response.body = body;
                            response.json = JSON.parse(body);
                            console.log("sendEmailRequest returning:", response);
                            resolve(response);
                        });
                    }
                }
            } catch (e) {
                reject(e);
            }
        }

        try {
            browser.messages.onNewMailReceived.addListener(handleNewMail);
            sendFilterControlMessage(account, command)
                .then(() => {
                    return;
                })
                .catch((error) => {
                    removeListener();
                    reject("sendFilterControlMessage failed:", error);
                });
        } catch (error) {
            reject("addListener failed:", error);
        }
    });
}
