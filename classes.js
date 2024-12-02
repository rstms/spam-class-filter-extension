
import { getAccounts, domainPart } from "./accounts.js";


async function sendFilterControlMessage(account, subject) {
    const identity = account.identities[0];
    const domain = domainPart(identity.email);
    const msg = {
	identityId: identity.id,
	to: ["filterctl@" + domain],
	from: identity.name + " <" + identity.email + ">",
	subject: subject,
	isPlainText: true
    };
    console.log("sending FilterControl Email:", msg);
    try {
	const comp = await browser.compose.beginNew();
	try {
	    const details = await browser.compose.getComposeDetails(comp.id);
	    try {
		await browser.compose.setComposeDetails(comp.id, msg);
		try {
		    const ret = await browser.compose.sendMessage(comp.id);
		    console.log("compose.sendMessage returned:", ret);
		} catch(error) { reject("compose.sendMessage failed:", error); }
	    } catch(error) { console.log("setComposeDetails failed:", error); }
	} catch(error) { console.log("getComposeDetails failed:", error); }
    } catch(error) { console.log("beginNew failed:", error); }
}

async function getMessageBody(message) {
    const fullMessage = await messenger.messages.getFull(message.id);
    for (const part of fullMessage.parts ) {
	if ( part.contentType === "text/plain" ) {
	    await messenger.messages.delete([message.id], true);
	    return(part.body);
	}
    }
    throw new Error("failed to find message body:", message);
}

function sendEmailRequest(account, command) {
    console.log("sendEmailRequest:", account, command);
    return new Promise((resolve, reject) => {

	function removeListener() {
	    try { 
		browser.messages.onNewMailReceived.removeListener(handleNewMail);
	    } catch (error) {
		console.log("removeListener failed:", error); 
	    }
	}

	function handleNewMail(folder, messageList) {
	    console.log("handleNewMail[" + account.id + "] messages:", messageList.messages.length);
	    for (const message of messageList.messages ) {
		if ( message.subject === "filterctl response" && message.folder.accountId === account.id ) {
		    console.log("filterctl response:", message);
		    removeListener();
		    var response = {
			command: command,
			accountId: message.folder.accountId
		    };

		    getMessageBody(message).then((body) => {
			response.body = body;
			try {
			    response.json = JSON.parse(body);
			    console.log("sendEmailRequest returning:", response);
			    resolve(response);
			} catch(error) { reject("JSON parse failed", error); }
		    }).catch((error) => { reject("getMessageBody failed:", error); });
		}
	    }
	}

	try {
	    browser.messages.onNewMailReceived.addListener(handleNewMail);
	    sendFilterControlMessage(account, command).then(() => {
		return;
	    }).catch((error) => { 
		removeListener();
		reject("sendFilterControlMessage failed:", error);
	    });
	} catch(error) { 
	    reject("addListener failed:", error); 
	}
    });
}

async function getSessionClasses() {
    var session = await browser.storage.session.get(["classes"]);
    if (session.classes ) {
	return session.classes;
    }
    return {};
}

async function getSessionDirty() {
    var session = await browser.storage.session.get(["dirty"]);
    if (session.dirty) {
	return session.dirty;
    }
    return {};
}

async function setDirty(accountId, state) {
    const dirty = await getSessionDirty();
    dirty[accountId] = state;
    await browser.storage.session.set({dirty: dirty});
}

async function isDirty(accountId) {
    const dirty = await getSessionDirty();
    return dirty[accountId];
}

// return true if classes differ or false if they are equal
function classesDiffer(original, current) {
    if (!original)
	return true;
    if (original.length != current.length) {
	return true;
    }
    for (let i=0; i<original.length; i++) {
	if (original[i].name != current[i].name) {
	    return true;
	}
	if (original[i].score != current[i].score) {
	    return true;
	}
    }
    return false;
}

export async function getClasses(accountId) {
    var classes = await getSessionClasses();
    const accounts = await getAccounts();
    if (!classes[accountId] ) {
	const result = await sendEmailRequest(accounts[accountId], "list");
	classes[accountId] = result.json.Classes
	await browser.storage.session.set({classes: classes});
	await setDirty(accountId, false);
    }
    return classes[accountId];
}

export async function setClasses(accountId, classes) {
    var classes = await getSessionClasses();
    const original = classes[accountId];
    classes[accountId] = classes;
    await browser.storage.session.set({classes: classes});
    const wasDirty = await isDirty(accountId);
    if (!wasDirty) {
	await setDirty(accountId, classesDiffer(original, classes));
    }
}

export async function saveClasses(accountId=null) {
    var classes;
    if (accountId) {
	classes = {};
	classes[accountId] = await getClasses(accountId);
    } else {
	classes = await getSessionClasses();
    }
    const accounts = await getAccounts();
    for ( const [accountId, levels] of Object.entries(classes) ) {
	const dirty = await isDirty(accountId);
	if (dirty) {
	    values = []
	    for (const level of levels) {
		values.push(level.name + "=" + level.score);
	    }
	    const subject = "reset " + levels.join(",");
	    const result = await sendEmailRequest(accounts[accountId], subject);
	    console.log("update result:", result)
	    await setDirty(accountId, false);
	}
    }
}
