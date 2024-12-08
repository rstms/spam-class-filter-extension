import { Classes } from "./classes.js";
import { config } from "./config.js";
import * as requests from "./request.js";
import * as ports from "./ports.js";
import { domainPart } from "./common.js";

var editor = null;
var systemTheme = null;
var editorWindowSize = null;
var editorWindowResolve = null;

var classes = new Classes();
var accounts = null;
var currentAccount = null;

const EDITOR_WINDOW_LOAD_TIMEOUT = 5000;

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
    } catch (e) {
        console.error(e);
    }
}

async function createWindow(name) {
    try {
        let args = await config.windowPosition.get(name);
        args.url = `./${name}.html`;
        args.type = "popup";
        args.allowScriptsToClose = true;
        return await browser.windows.create(args);
    } catch (e) {
        console.error(e);
    }
}

function createEditorWindow() {
    return new Promise((resolve, reject) => {
        try {
            var timer = setTimeout(() => {
                reject(new Error("editor window timeout"));
            }, EDITOR_WINDOW_LOAD_TIMEOUT);

            editorWindowResolve = (size) => {
                //console.log("editor window resolver:", size);
                clearTimeout(timer);
                editorWindowResolve = null;
                resolve(size);
            };

            createWindow("editor").then((e) => {
                editor = e;
                //console.log("editor window created:", editor);
            });
        } catch (e) {
            reject(e);
        }
    });
}

async function showEditor() {
    try {
        await loadClasses(true);

        if (editor) {
            console.log("sending selectAccount");
            const port = await ports.get("editor");
            const result = await requests.sendMessage(port, { id: "selectAccount" });
            console.log("selectAccount result:", result);
            return;
        }
        //console.log("calling createEditorWindow...");
        const size = await createEditorWindow();
        //console.log("createEditorWindow returned:", size);
        //console.log("editor:", editor);
        await browser.windows.update(editor.id, size);
    } catch (e) {
        console.error(e);
    }
}

async function handleIconClicked() {
    await showEditor();
}

async function handleMenuClick(info, tab) {
    try {
        switch (info.menuItemId) {
            case "rstms-filterctl-context-menu":
                var accountId;
                if (info.selectedAccount) {
                    accountId = info.selectedAccount.id;
                } else {
                    accountId = info.selectedFolders[0].accountId;
                }
                currentAccount = accounts[accountId];
                await showEditor();
                break;
            case "rstms-filterctl-tools-menu":
                await showEditor();
                break;
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
    await initializeAccounts();
    try {
        console.log(mode, window);
        //await showEditor();
    } catch (e) {
        console.error(e);
    }
}

browser.menus.create({
    id: "rstms-filterctl-context-menu",
    title: "Spam Class Thresholds",
    contexts: ["folder_pane"],
});

browser.menus.create({
    id: "rstms-filterctl-tools-menu",
    title: "Spam Class Thresholds",
    contexts: ["tools_menu"],
});

async function handleStartup() {
    await config.session.reset();
    await initialize("startup");
}

async function handleInstalled() {
    await config.local.reset();
    await config.session.reset();
    await initialize("installed");
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
                case "editorWindowLoaded":
                    editorWindowResolve({ height: message.height, width: message.width });
                case "resizeEditorWindow":
                    editorWindowSize = { height: message.height, width: message.width };
                    if (editor) {
                        await browser.windows.update(editor.id, editorWindowSize);
                    }
                    requests.respond(sender, message);
                    break;
                case "saveWindowPosition":
                    await config.windowPosition.set(message.name, {
                        left: message.left,
                        top: message.top,
                        height: message.height,
                        width: message.width,
                    });
                case "getClasses":
                    const levels = await classes.get(accounts[message.accountId]);
                    requests.respond(sender, message, { levels: levels });
                    break;
                case "setClasses":
                    var state = await classes.set(accounts[message.accountId], message.levels);
                    requests.respond(sender, message, { state: state });
                    break;
                case "getAccounts":
                    requests.respond(sender, message, { accounts: accounts });
                    break;
                case "getCurrentAccountId":
                    requests.respond(sender, message, { accountId: currentAccount.id });
                    break;
                case "setDefaultLevels":
                    await classes.setDefaultLevels(accounts[message.accountId]);
                    requests.respond(sender, message);
                    break;
                case "refreshAll":
                    await loadClasses(true);
                    requests.respond(sender, message);
                    break;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadClasses(force = false) {
    for (const account of Object.values(accounts)) {
        await classes.get(account, force);
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
browser.runtime.onConnect.addListener(handleConnect);
