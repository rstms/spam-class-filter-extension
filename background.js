import { Classes } from "./classes.js";
import { config } from "./config.js";
import * as requests from "./requests.js";
import * as ports from "./ports.js";
import { domainPart } from "./common.js";

/* globals browser, console */

//const EDITOR_WINDOW_LOAD_TIMEOUT = 5000;
//const EDITOR_WINDOW_LOAD_TIMEOUT = 0;

var editor = null;
var editorWindowResolve = null;
var editorPosition = {};

var classes = new Classes();
var accounts = null;

// account selected in editor
var currentAccount = null;

// account of context menu click in accounts/folders tree
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
        currentAccount = defaultAccount();
        selectedAccount = currentAccount;
    } catch (e) {
        console.error(e);
    }
}

/*
async function createWindow(name) {
    try {
        let args = await config.windowPosition.get(name);
        console.log("saved windowPosition:", args);
        args.url = `./${name}.html`;
        args.type = "popup";
        args.allowScriptsToClose = true;
        return await browser.windows.create(args);
    } catch (e) {
        console.error(e);
    }
}
*/

/*
function createEditorWindow(timeout = undefined) {
    return new Promise((resolve, reject) => {
        try {
            var timer = null;

            if (timeout === undefined) {
                timeout = EDITOR_WINDOW_LOAD_TIMEOUT;
            }

            if (timeout !== 0) {
                timer = setTimeout(() => {
                    reject(new Error("create editor window timeout"));
                }, timeout);
            }

            editorWindowResolve = (result) => {
                console.log("editor window resolver called:", result);
                if (timer) {
                    clearTimeout(timer);
                }
                editorWindowResolve = null;
                resolve(result);
            };

            createWindow("editor").then((e) => {
                editor = e;
                console.log("editor window created:", editor);
            });
        } catch (e) {
            reject(e);
        }
    });
}
*/

async function showEditor() {
    try {
        console.log("showEditor:", editor);
        console.log("currentAccount.id:", currentAccount.id);
        console.log("selectedAccount.Id", selectedAccount.id);

        if (editor) {
            // editor is running, bring it to foreground and resize it
            let args = editorPosition;
            args.focused = true;
            await browser.windows.update(editor.id, args);

            if (selectedAccount != currentAccount) {
                // ask the editor to change to selectedAccount if possible
                const port = await ports.get("editor");
                await requests.sendMessage(port, { id: "selectAccount", accountId: selectedAccount.id });
                selectedAccount = currentAccount;
            }
        } else {
            // editor is not open, so okay to change currentAccount
            if (selectedAccount != currentAccount) {
                currentAccount = selectedAccount;
            }
            await browser.runtime.openOptionsPage();
            //editorPosition = await createEditorWindow();
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleIconClicked() {
    try {
        await showEditor();
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
                        selectedAccount = accounts[id];
                    }
                }
                await showEditor();
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
        await initializeAccounts();
        console.log(mode);
        //await showEditor();
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
        await config.session.reset();
        await initialize("startup");
    } catch (e) {
        console.error(e);
    }
}

async function handleInstalled() {
    try {
        await config.local.reset();
        await config.session.reset();
        await initialize("installed");
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

async function saveClasses(message) {
    try {
        const validationResult = await await classes.send(accounts[message.accountId], message.levels);
        return validationResult;
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
        return accounts;
    } catch (e) {
        console.error(e);
    }
}

async function getCurrentAccountId() {
    try {
        return currentAccount.id;
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
        return await classes.get(currentAccount);
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

browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);
browser.menus.onClicked.addListener(handleMenuClick);
browser.action.onClicked.addListener(handleIconClicked);
browser.windows.onRemoved.addListener(handleWindowRemoved);
browser.runtime.onConnect.addListener(handleConnect);
requests.addHandler("getSystemTheme", getSystemTheme);
requests.addHandler("setClasses", setClasses);
requests.addHandler("getClasses", getClasses);
requests.addHandler("saveClasses", saveClasses);
requests.addHandler("getEditorWindowId", getEditorWindowId);
requests.addHandler("setComposePosition", setComposePosition);
requests.addHandler("editorWindowLoaded", editorWindowLoaded);
requests.addHandler("loadWindowPosition", loadWindowPosition);
requests.addHandler("getAccounts", getAccounts);
requests.addHandler("getCurrentAccountId", getCurrentAccountId);
requests.addHandler("setDefaultLevels", setDefaultLevels);
requests.addHandler("refreshAll", refreshAll);
