import { Classes } from "./classes.js";
import { config } from "./config.js";
import * as requests from "./requests.js";
import * as ports from "./ports.js";
import { domainPart } from "./common.js";

/* globals browser, console */

var editor = null;
var editorWindowResolve = null;

var classes = new Classes();
var accounts = null;
var selectedAccount = null;

const menuId = "rstms-spam-filter-classes-menu";

function defaultAccount() {
    try {
        const keys = Object.keys(accounts).sort();
        return accounts[keys[0]];
    } catch (e) {
        console.error(e);
    }
}

export async function initializeAccounts() {
    try {
        accounts = {};
        const accountList = await browser.accounts.list();
        const domains = await config.local.get("domain");
        //console.log("accounts.GetAll domains:", domains);
        for (const account of accountList) {
            if (account.type === "imap") {
                const domain = domainPart(account.identities[0].email);
                //console.log("accounts.GetAll checking domain:", domain);
                if (domains[domain]) {
                    accounts[account.id] = account;
                }
            }
        }
        selectedAccount = defaultAccount;
    } catch (e) {
        console.error(e);
    }
}

async function handleIconClicked() {
    try {
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

async function handleMenuClick(info) {
    try {
        switch (info.menuItemId) {
            case menuId:
                if (info.selectedFolders && info.selectedFolders.length > 0) {
                    const id = info.selectedFolders[0].accountId;
                    if (id && accounts[id]) {
                        // the user clicked the context menu in the folder list,
                        // so select the account of the folder if possible
                        selectedAccount = accounts[id];
                        const port = await ports.get("editor", ports.NO_WAIT);
                        if (port) {
                            await requests.sendMessage(port, { id: "selectAccount", accountId: id });
                        }
                    }
                }
                await focusEditorWindow();
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleWindowRemoved(closedId) {
    try {
        if (editor && closedId == editor.id) {
            editor = null;
        }
    } catch (e) {
        console.error(e);
    }
}

async function initialize(mode) {
    try {
        console.log(mode);
        if (!accounts) {
            await initializeAccounts();
        }
        await config.session.reset();
        classes.options.autoDelete = await config.local.get("autoDelete");
    } catch (e) {
        console.error(e);
    }
}

browser.menus.create({
    id: menuId,
    title: "Spam Class Thresholds",
    contexts: ["tools_menu", "folder_pane"],
});

async function handleStartup() {
    try {
        await initialize("startup");
    } catch (e) {
        console.error(e);
    }
}

async function handleInstalled() {
    try {
        await initialize("installed");
    } catch (e) {
        console.error(e);
    }
}

async function handleSuspendCanceled() {
    try {
        await initialize("suspendCanceled");
    } catch (e) {
        console.error(e);
    }
}

async function focusEditorWindow() {
    try {
        const tabs = await browser.tabs.query({ title: "Spam Filter Classes", type: "content" });
        if (tabs.length > 0) {
            await browser.windows.update(tabs[0].windowId, { focused: true });
        }
        await browser.runtime.openOptionsPage();
        const port = await ports.get("editor");
        await requests.sendMessage(port, { id: "selectEditorTab", name: "classes" });
    } catch (e) {
        console.error(e);
    }
}

async function getSystemTheme() {
    try {
        const tabs = await browser.tabs.query({ type: "mail" });
        for (const tab of tabs) {
            const theme = await browser.theme.getCurrent(tab.id);
            console.log("tab theme:", tab, theme);
        }
        return {};
    } catch (e) {
        console.error(e);
    }
}

async function getClasses(message) {
    try {
        console.log("getClasses:", message);
        let levels = await classes.get(accounts[message.accountId]);
        return levels;
    } catch (e) {
        console.error(e);
    }
}

async function setClasses(message) {
    try {
        let validationResult = await classes.set(accounts[message.accountId], message.levels);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendClasses(message) {
    try {
        let validationResult = await classes.set(accounts[message.accountId], message.levels);
        if (validationResult.valid) {
            validationResult = await await classes.sendUpdate(accounts[message.accountId]);
        }
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllClasses(message) {
    try {
        return await classes.sendAllUpdates(accounts, message.force);
    } catch (e) {
        console.error(e);
    }
}

async function getEditorWindowId() {
    try {
        return editor.id;
    } catch (e) {
        console.error(e);
    }
}

async function setComposePosition(message) {
    try {
        classes.setComposePosition(message.position);
    } catch (e) {
        console.error(e);
    }
}

async function editorWindowLoaded(message) {
    try {
        console.log("editorWindowLoaded");
        editorWindowResolve(message.position);
    } catch (e) {
        console.error(e);
    }
}

async function loadWindowPosition(message) {
    try {
        return await config.windowPosition.get(message.name, message.defaults);
    } catch (e) {
        console.error(e);
    }
}

async function getAccounts() {
    try {
        if (!accounts) {
            await initializeAccounts();
        }
        return accounts;
    } catch (e) {
        console.error(e);
    }
}

async function getSelectedAccountId() {
    try {
        if (!accounts) {
            await initializeAccounts();
        }
        return selectedAccount.id;
    } catch (e) {
        console.error(e);
    }
}
async function setDefaultLevels(message) {
    try {
        return await classes.setDefaultLevels(accounts[message.accountId]);
    } catch (e) {
        console.error(e);
    }
}
async function refreshAll() {
    try {
        await loadClasses(true);
    } catch (e) {
        console.error(e);
    }
}

async function handleMessage(message, sender) {
    try {
        console.log("background received:", message);
        // resolve responses to our request messages
        if (await requests.resolveResponses(message)) {
            return;
        }
        if (await requests.resolveRequests(message, sender)) {
            return;
        }
        // message not handled by requests
        switch (message.id) {
            case "ping":
                sender.postMessage({ id: "pong", src: "background" });
                break;
            case "saveWindowPosition":
                await config.windowPosition.set(message.name, message.position);
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadClasses(force = false) {
    try {
        for (const account of Object.values(accounts)) {
            await classes.get(account, force);
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleDisconnect(port) {
    try {
        console.log("background got disconnect:", port);
        ports.remove(port);
    } catch (e) {
        console.error(e);
    }
}

async function handleConnect(port) {
    try {
        console.log("background got connection:", port);
        ports.add(port);
        port.onMessage.addListener(handleMessage);
        port.onDisconnect.addListener(handleDisconnect);
        //port.postMessage({ id: "ping", src: "background" });
    } catch (e) {
        console.error(e);
    }
}

async function sendCommand(message) {
    try {
        let parts = [message.command.trim()];
        if (message.argument.trim()) {
            parts.push(message.argument.trim());
        }
        const subject = parts.join(" ");
        const account = accounts[message.accountId];
        return await classes.sendCommand(account, subject);
    } catch (e) {
        console.error(e);
    }
}

async function handleSuspend() {
    try {
        const port = await ports.get("editor", ports.NO_WAIT);
        if (port) {
            console.log("background suspending, disconnecting port");
            port.disconnect();
        }
    } catch (e) {
        console.error(e);
    }
}

async function getConfigValue(message) {
    try {
        return await config.local.get(message.key);
    } catch (e) {
        console.error(e);
    }
}

async function setConfigValue(message) {
    try {
        await config.local.set(message.key, message.value);
        switch (message.key) {
            case "autoDelete":
                classes.options.autoDelete = message.value;
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);
browser.runtime.onSuspend.addListener(handleSuspend);
browser.runtime.onSuspendCanceled.addListener(handleSuspendCanceled);

browser.menus.onClicked.addListener(handleMenuClick);
browser.action.onClicked.addListener(handleIconClicked);
browser.windows.onRemoved.addListener(handleWindowRemoved);
browser.runtime.onConnect.addListener(handleConnect);

requests.addHandler("getSystemTheme", getSystemTheme);
requests.addHandler("setClasses", setClasses);
requests.addHandler("getClasses", getClasses);
requests.addHandler("sendClasses", sendClasses);
requests.addHandler("sendAllClasses", sendAllClasses);
requests.addHandler("getEditorWindowId", getEditorWindowId);
requests.addHandler("setComposePosition", setComposePosition);
requests.addHandler("editorWindowLoaded", editorWindowLoaded);
requests.addHandler("loadWindowPosition", loadWindowPosition);
requests.addHandler("getAccounts", getAccounts);
requests.addHandler("getSelectedAccountId", getSelectedAccountId);
requests.addHandler("setDefaultLevels", setDefaultLevels);
requests.addHandler("refreshAll", refreshAll);
requests.addHandler("sendCommand", sendCommand);
requests.addHandler("setConfigValue", setConfigValue);
requests.addHandler("getConfigValue", getConfigValue);
