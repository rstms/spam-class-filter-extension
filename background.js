import { Classes } from "./classes.js";
import { config } from "./config.js";
import * as requests from "./requests.js";
import * as ports from "./ports.js";
import { domainPart } from "./common.js";

/* globals browser, console */

var classesState = null;
var accountsState = null;

const menuId = "rstms-spam-filter-classes-menu";
const OPTIONS_TITLE = "Spam Filter Classes";

function defaultAccount(accounts) {
    try {
        const keys = Object.keys(accounts).sort();
        return accounts[keys[0]];
    } catch (e) {
        console.error(e);
    }
}

export async function getAccounts() {
    try {
        if (accountsState === null) {
            accountsState = {};
            const accountList = await browser.accounts.list();
            const domains = await config.local.get("domain");
            for (const account of accountList) {
                if (account.type === "imap") {
                    const domain = domainPart(account.identities[0].email);
                    if (domains[domain]) {
                        accountsState[account.id] = account;
                    }
                }
            }
        }
        return accountsState;
    } catch (e) {
        console.error(e);
    }
}

async function getSelectedAccount() {
    try {
        let selectedAccount = await config.session.get("selectedAccount");
        if (!selectedAccount) {
            if (!selectedAccount) {
                const accounts = await getAccounts();
                selectedAccount = defaultAccount(accounts);
            }
        }
        return selectedAccount;
    } catch (e) {
        console.error(e);
    }
}

async function setSelectedAccount(account) {
    try {
        await config.session.set("selectedAccount", account);
    } catch (e) {
        console.error(e);
    }
}

export async function getClasses() {
    try {
        if (classesState === null) {
            const state = await config.session.get("classState");
            const options = {
                autoDelete: await config.local.get("autoDelete"),
            };
            const accounts = await getAccounts();
            classesState = new Classes(state, options, accounts);
        }
        return classesState;
    } catch (e) {
        console.error(e);
    }
}

export async function saveClasses(classes) {
    try {
        classesState = classes;
        await config.session.set("classState", classes.state());
    } catch (e) {
        console.error(e);
    }
}

async function handleMenuClick(info) {
    try {
        switch (info.menuItemId) {
            case menuId:
                var sendAccountId = false;
                if (info.selectedFolders && info.selectedFolders.length > 0) {
                    const id = info.selectedFolders[0].accountId;
                    const accounts = await getAccounts();
                    if (id && accounts[id]) {
                        // the user clicked the context menu in the folder list,
                        // so select the account of the folder if possible
                        sendAccountId = id;
                        await setSelectedAccount(accounts[id]);
                    }
                }
                await focusEditorWindow(sendAccountId);
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

async function findOptionsTab() {
    try {
        const tabs = await browser.tabs.query({ type: "content" });
        for (const tab of tabs) {
            if (tab.title === OPTIONS_TITLE) {
                return tab;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
    }
}

async function focusEditorWindow(sendAccountId) {
    try {
        console.log("focusEditorWindow");

        var optionsTab = await findOptionsTab();
        console.log("editor tab:", optionsTab);
        var port = await ports.get("editor", ports.NO_WAIT);
        console.log("editor port:", port);

        await browser.runtime.openOptionsPage();

        if (optionsTab) {
            // editor was already open, assume we're coming back from being suspended
            console.log("sending activated notification");
            browser.runtime.sendMessage({ id: "backgroundActivated" });
            console.log("activated notificaton sent");
        }

        if (!port) {
            console.log("awaiting editor port connection...");
            port = await ports.get("editor", ports, ports.WAIT_FOREVER);
            console.log("detected editor port connection");
        }
        await requests.sendMessage(port, { id: "selectEditorTab", name: "classes" });
        if (sendAccountId) {
            await requests.sendMessage(port, { id: "selectAccount", accountId: sendAccountId });
        }
    } catch (e) {
        console.error(e);
    }
}

async function initialize(mode) {
    try {
        console.log("background initialize:", mode);
        switch (mode) {
            case "installed":
                await config.local.set("autoDelete", true);
                await config.local.set("optInApproved", false);
                await config.local.set("advancedTabVisible", false);
                await config.local.set("spamClassesEditorTheme", "auto");
                break;
        }
        await getClasses();
    } catch (e) {
        console.error(e);
    }
}

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

async function handleSuspend() {
    try {
        console.log("background suspending");
        const port = await ports.get("editor", ports.NO_WAIT);
        if (port) {
            port.postMessage({ id: "backgroundSuspending" });
        }
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

/*
async function getSystemTheme() {
    try {
        const tabs = await browser.tabs.query({ type: "mail" });
        for (const tab of tabs) {
            const theme = await browser.theme.getCurrent(tab.id);
            if (verbose) {
                console.log("tab theme:", tab, theme);
            }
        }
        return {};
    } catch (e) {
        console.error(e);
    }
}
*/

async function getClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
        const levels = await classes.get(accounts[message.accountId]);
        return levels;
    } catch (e) {
        console.error(e);
    }
}

async function setClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
        const validationResult = await classes.set(accounts[message.accountId], message.levels);
        await saveClasses(classes);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
        let validationResult = await classes.set(accounts[message.accountId], message.levels);
        if (validationResult.valid) {
            validationResult = await await classes.send(accounts[message.accountId]);
        }
        await saveClasses(classes);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
        const result = await classes.sendAll(accounts, message.force);
        await saveClasses(classes);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function getSelectedAccountId() {
    try {
        const account = await getSelectedAccount();
        const id = account.id;
        console.log("getSelectedAccountId returning:", id);
        return id;
    } catch (e) {
        console.error(e);
    }
}

async function setDefaultLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
        const result = await classes.setDefaultLevels(accounts[message.accountId]);
        await saveClasses(classes);
        return result;
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

async function handlePortMessage(message, sender) {
    try {
        console.log("background received:", message.id);
        console.debug("background received message:", message);
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
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadClasses(force = false) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
        for (const account of Object.values(accounts)) {
            await classes.get(account, force);
        }
        await saveClasses(classes);
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
        port.onMessage.addListener(handlePortMessage);
        port.onDisconnect.addListener(handleDisconnect);
    } catch (e) {
        console.error(e);
    }
}

async function sendCommand(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getClasses();
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
        if (message.key === "autoDelete") {
            const classes = await getClasses();
            classes.options.autoDelete = message.value;
            await saveClasses(classes);
        }
    } catch (e) {
        console.error(e);
    }
}

//requests.addHandler("getSystemTheme", getSystemTheme);
requests.addHandler("setClassLevels", setClassLevels);
requests.addHandler("getClassLevels", getClassLevels);
requests.addHandler("sendClassLevels", sendClassLevels);
requests.addHandler("sendAllClassLevels", sendAllClassLevels);
requests.addHandler("getAccounts", getAccounts);
requests.addHandler("getSelectedAccountId", getSelectedAccountId);
requests.addHandler("setDefaultLevels", setDefaultLevels);
requests.addHandler("refreshAll", refreshAll);
requests.addHandler("sendCommand", sendCommand);
requests.addHandler("setConfigValue", setConfigValue);
requests.addHandler("getConfigValue", getConfigValue);

browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);
browser.runtime.onSuspend.addListener(handleSuspend);
browser.runtime.onSuspendCanceled.addListener(handleSuspendCanceled);
browser.menus.onClicked.addListener(handleMenuClick);
browser.runtime.onConnect.addListener(handleConnect);

browser.menus.create({
    id: menuId,
    title: "Spam Class Thresholds",
    contexts: ["tools_menu", "folder_pane"],
});

console.log("background page loaded");
