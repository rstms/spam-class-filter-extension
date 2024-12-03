import * as accounts from "./accounts.js";
import { getClasses } from "./classes.js";
import * as config from "./config.js";
import { setThemeHook } from "./email.js";
import * as requests from "./request.js";
import * as ports from "./ports.js";

var editor = null;
var systemTheme = null;

async function registerComposeContentScript() {
    try {
        const scriptId = "spam_filter_class_compose_content";

        if (!(await isRegisteredComposeScript(scriptId))) {
            const scripts = [
                {
                    id: scriptId,
                    js: ["content.js"],
                },
            ];

            await messenger.scripting.compose.registerScripts(scripts);
            const script = await isRegisteredComposeScript(scriptId);
            if (!script) {
                throw new Error("content script not registered");
            }
        }
    } catch (error) {
        console.error("registerScripts failed:", error);
    }
}

async function isRegisteredComposeScript(scriptId) {
    try {
        const scripts = await messenger.scripting.compose.getRegisteredScripts();
        for (var script of scripts) {
            if (script.id === scriptId) {
                return script;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
    }
}

async function executeContentScript() {
    try {
        const tabs = await browser.tabs.query({ type: "mail" });
        const tid = tabs[0].id;
        const injection = {
            target: { tabId: tid },
            files: ["tab.js"],
            injectImmediately: true,
        };
        const result = await browser.scripting.executeScript(injection);
        console.log("execute result:", result);
    } catch (e) {
        console.error(e);
    }
}

async function registerContentScript() {
    try {
        const scriptId = "spam_filter_class_content";

        if (!(await isRegisteredScript(scriptId))) {
            const scripts = [
                {
                    id: scriptId,
                    js: ["tab.js"],
                    matches: ["<all_urls>"],
                },
            ];

            await browser.scripting.registerContentScripts(scripts);
            const script = await isRegisteredScript(scriptId);
            if (!script) {
                throw new Error("content script not registered");
            }
        }
    } catch (error) {
        console.error("registerScripts failed:", error);
    }
}

async function isRegisteredScript(scriptId) {
    try {
        const scripts = await browser.scripting.getRegisteredContentScripts();
        for (var script of scripts) {
            if (script.id === scriptId) {
                return script;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
    }
}

function handleStorageChange(changes, areaName) {
    for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
        console.log("storage changed:", areaName, key, oldValue, newValue);
    }
}

async function createWindow(name) {
    try {
        var defaults = {};
        switch (name) {
            case "editor":
                defaults = {
                    width: 500,
                    height: 400,
                };
        }
        const pos = await config.windowPosition.get(name, defaults);
        var args = {
            url: `./${name}.html`,
            type: "popup",
            allowScriptsToClose: true,
            height: pos.height,
            width: pos.width,
        };
        if (pos.top) {
            args.top = pos.top;
        }
        if (pos.left) {
            args.left = pos.left;
        }
        return await browser.windows.create(args);
    } catch (e) {
        console.error(e);
    }
}

async function showEditor() {
    try {
        const accountId = await accounts.currentId();
        await getClasses(accountId);

        if (editor) {
            console.log("sending selectAccount");
            const port = await ports.get("editor");
            const result = await requests.sendMessage(port, { id: "selectAccount" });
            console.log("selectAccount result:", result);
            return;
        }

        editor = await createWindow("editor");
    } catch (e) {
        console.error(e);
    }
}

async function handleIconClicked() {
    //var theme = await browser.theme.getCurrent();
    //console.log("theme:", theme);
    /*
    try {
        if (editor) {
            const port = await ports.get("editor");
            const response = await requests.sendMessage(port, { id: "howdy", responseKey: "text" });
            console.log("howdy response:", response);
        } else {
            console.log("no editor");
        }
    } catch (e) {
        console.error(e);
    }
    */
    await showEditor();
}

async function handleMenuClick(info, tab) {
    try {
        if (info.menuItemId === "rstms-filterctl-menu") {
            var accountId;
            if (info.selectedAccount) {
                accountId = info.selectedAccount.id;
            } else {
                accountId = info.selectedFolders[0].accountId;
            }
            await accounts.setCurrentId(accountId);
            await showEditor();
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleWindowRemoved(closedId) {
    if (editor && closedId == editor.id) {
        editor = null;
    }
}

async function initialize(mode) {
    try {
        console.log(mode, window);
        await showEditor();
        //executeContentScript();
        //const port = await ports.get("tab");
        //const response = await requests.sendMessage(port, { id: "getSystemTheme", responseKey: "systemTheme" });
        //console.log("theme:", response);
        //await config.set("systemTheme", response, config.SESSION);
        //registerContentScript();
        //registerComposeContentScript();
        //setThemeHook(requestSystemTheme);
    } catch (e) {
        console.error(e);
    }
}

browser.menus.create({
    id: "rstms-filterctl-menu",
    title: "Spam Class Thresholds",
    contexts: ["folder_pane"],
});

async function handleStartup() {
    await initialize("startup");
}

async function handleInstalled() {
    await initialize("installed");
}

async function requestSystemTheme() {
    try {
        console.log("requestSystemTheme called");
        const port = await ports.get("content");
        const theme = await requests.sendMessage(port, { id: "getSystemTheme", responseKey: "systemTheme" });
        console.log("received theme:", theme);
        await config.set("systemTheme", theme, config.SESSION);
        await setThemeHook(null);
    } catch (e) {
        console.error(e);
    }
}

async function handleMessage(message, sender) {
    try {
        console.log("background received message:", sender.name, message);
        if (!requests.resolveResponse(message)) {
            switch (message.id) {
                case "ping":
                    sender.postMessage({ id: "pong", src: "background" });
                    break;
                case "getSystemTheme":
                    requests.respond(sender, message, { systemTheme: systemTheme });
                    break;
                case "resizeEditorWindow":
                    await browser.windows.update(editor.id, { height: message.height, width: message.width });
                    requests.respond(sender, message);
                    break;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleDisconnect(port) {
    try {
        //console.log("background got disconnect:", port);
        ports.remove(port);
    } catch (e) {
        console.error(e);
    }
}

async function handleConnect(port) {
    try {
        //console.log("background got connection:", port);
        ports.add(port);
        port.onMessage.addListener(handleMessage);
        port.onDisconnect.addListener(handleDisconnect);
        //port.postMessage({ id: "ping", src: "background" });
    } catch (e) {
        console.error(e);
    }
}

browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);

browser.menus.onClicked.addListener(handleMenuClick);
browser.action.onClicked.addListener(handleIconClicked);
browser.windows.onRemoved.addListener(handleWindowRemoved);
browser.storage.onChanged.addListener(handleStorageChange);
browser.runtime.onConnect.addListener(handleConnect);
