
import { setCurrentAccountId, getCurrentAccountId } from "./accounts.js";
import { getClasses } from "./classes.js";
import { getConfig, getWindowPos } from "./config.js";

var editor = null;

function handleStorageChange(changes, areaName) {
    for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
	console.log("storage changed:", areaName, key, oldValue, newValue);
    }
}

async function registerScript() {

    const scriptId = "spam_filter_class_content";

    if (await isRegisteredScript(scriptId)) {
	return;
    }

    const scripts = [
	{
	    id: scriptId,
	    js: ["content.js"],
	}
    ];

    try {
	await messenger.scripting.compose.registerScripts(scripts);
	try {
	    if (await isRegisteredScript(scriptId)) {
		return
	    }
	    throw new Error("content script not registered");
	} catch(error) { console.log("isRegisteredScript failed:", error); };
    } catch(error) { console.log("registerScripts failed:", error); };
}

async function isRegisteredScript(scriptId) {
    try {
	const scripts = await messenger.scripting.compose.getRegisteredScripts();
	for (var script of scripts) {
	    if (script.id === scriptId ) {
		console.log("registered:", script);
		return true;
	    }
	}
	console.log("not registered");
    } catch(error) { console.log("getRegisteredScripts failed:", error); };
    return false;
}

async function showEditor() {

    if ( editor ) {
	console.log("fixme: select new account in existing editor window");
	return;
    }

    const accountId = await getCurrentAccountId();
    await getClasses(accountId);

    var defaults = {
	width: 500,
	height: 400
    };

    var pos = await getWindowPos("editor", defaults);

    const args = {
	url: "editor.html",
	type: "popup",
	height: pos.height,
	width: pos.width,
	allowScriptsToClose: true
    }
    if (pos.x) {
	args.left = pos.x;
    }
    if (pos.y) {
	args.top = pos.y;
    }

    console.log("create:", args);
    editor = await browser.windows.create(args);
}

async function onIconClicked() {
    await showEditor();
}

async function handleMenuClick(info, tab) {

    if (info.menuItemId === "rstms-filterctl-menu") {
	var accountId;
	if ( info.selectedAccount ) {
	    console.log(info);
	    accountId = info.selectedAccount.id;
	} else {
	    console.log(info);
	    accountId = info.selectedFolders[0].accountId;
	}
	await setCurrentAccountId(accountId);
	await showEditor();
    }
}

async function onWindowRemoved(closedId) {
    if ( editor && closedId == editor.id ) {
	editor = null;
    }
}

async function initialize(mode) {
    console.log("initialize[" + mode + "]");
    try {
	registerScript();
    } catch(error) { console.log("registerScript failed:", error); }
}

browser.menus.create({
    id: "rstms-filterctl-menu",
    title: "Spam Class Thresholds",
    contexts: ["folder_pane"]
});

async function handleStartup() {
    await initialize("startup");
}

async function handleInstalled() {
    await initialize("installed");
};

async function handleMessage(message, sender) {
    console.log("background handleMessage:", message, sender);
    if message.hasOwnProperty("SpamFilterClassExtension") {
	switch (message.command) {
	    case "systemTheme":
		console.log("background received systemTheme:", message);
		break;
	}
    }
    return false;
}

browser.runtime.onMessage.addListener(handleMessage);
browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);

browser.storage.onChanged.addListener(handleStorageChange);
browser.menus.onClicked.addListener(handleMenuClick);
browser.action.onClicked.addListener(onIconClicked);
browser.windows.onRemoved.addListener(onWindowRemoved);
