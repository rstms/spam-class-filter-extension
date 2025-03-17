import { FilterClasses, FilterBooks } from "./classes.js";
import { config } from "./config.js";
import * as requests from "./requests.js";
import * as ports from "./ports.js";
import { domainPart } from "./common.js";
import { sendEmailRequest } from "./email.js";

/* globals browser, console */

var classesState = null;
var filterBooksState = null;
var accountsState = null;

const STARTUP_OPT_IN_APPROVED = true;
const STARTUP_ADVANCED_TAB_VISIBLE = true;

const menuId = "rstms-spam-filter-classes-menu";
const EDITOR_TITLE = "Spam Filter Classes";
const addressBookFilterMenuId = "rstms-address-book-filter-menu";

var menusCreated = false;
async function initMenus() {
    try {
        if (!menusCreated) {
            await browser.menus.create({
                id: menuId,
                title: "Spam Class Thresholds",
                contexts: ["tools_menu", "folder_pane"],
            });
            await browser.menus.create({
                id: addressBookFilterMenuId,
                title: "Add To Address Book Filter",
                contexts: ["message_list"],
            });

            menusCreated = true;
        }
    } catch (e) {
        console.error(e);
    }
}

function defaultAccount(accounts) {
    try {
        const keys = Object.keys(accounts).sort();
        return accounts[keys[0]];
    } catch (e) {
        console.error(e);
    }
}

async function getAccounts() {
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

async function handleMenuClick(info) {
    try {
        console.log("menu click:", info);
        switch (info.menuItemId) {
            case menuId:
                if (!(await config.local.get("optInApproved"))) {
                    await browser.runtime.openOptionsPage();
                    return;
                }
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
            case addressBookFilterMenuId:
                console.log("add to address book filter");
        }
    } catch (e) {
        console.error(e);
    }
}

async function findEditorTab() {
    try {
        const tabs = await browser.tabs.query({ type: "content" });
        for (const tab of tabs) {
            if (tab.title === EDITOR_TITLE) {
                return tab;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
    }
}

async function getEditorPort(wait) {
    try {
        console.log("awaiting editor port connection...");
        var port = await ports.get("editor", ports, wait);
        console.log("detected editor port connection");
        return port;
    } catch (e) {
        console.error(e);
    }
}

async function focusEditorWindow(sendAccountId) {
    try {
        console.log("focusEditorWindow");

        var editorTab = await findEditorTab();
        console.log("editor tab:", editorTab);
        var port = await ports.get("editor", ports.NO_WAIT);
        console.log("editor port:", port);

        if (editorTab) {
            await browser.tabs.update(editorTab.id, { active: true });
            if (!port) {
                // editor is open but port is null; assume we're coming back from being suspended
                console.log("sending activated notification");
                browser.runtime.sendMessage({ id: "backgroundActivated" });
                console.log("activated notificaton sent");
            }
        } else {
            await browser.tabs.create({ url: "./editor.html" });
        }

        if (!port) {
            port = await getEditorPort();
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
                await config.local.set("optInApproved", STARTUP_OPT_IN_APPROVED);
                await config.local.set("advancedTabVisible", STARTUP_ADVANCED_TAB_VISIBLE);
                await config.local.set("preferredTheme", "auto");
                break;
        }
        await getFilterClasses();
        await getFilterBooks();
        initMenus();
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

async function loadFilterClasses(force = false) {
    try {
        const accounts = await getAccounts();
        const classes = await getFilterClasses();
        for (const account of Object.values(accounts)) {
            await classes.get(account, force);
        }
        await saveFilterClasses(classes);
    } catch (e) {
        console.error(e);
    }
}

async function getFilterClasses() {
    try {
        if (classesState === null) {
            const state = await config.session.get("filterClassesState");
            const accounts = await getAccounts();
            classesState = new FilterClasses(state, accounts);
        }
        return classesState;
    } catch (e) {
        console.error(e);
    }
}

async function saveFilterClasses(classes) {
    try {
        classesState = classes;
        await config.session.set("filterClassesState", classes.state());
    } catch (e) {
        console.error(e);
    }
}

async function getClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getFilterClasses();
        const levels = await classes.get(accounts[message.accountId]);
        return levels;
    } catch (e) {
        console.error(e);
    }
}

async function setClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getFilterClasses();
        const validationResult = await classes.set(accounts[message.accountId], message.levels);
        await saveFilterClasses(classes);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getFilterClasses();
        let validationResult = await classes.set(accounts[message.accountId], message.levels);
        if (validationResult.valid) {
            validationResult = await await classes.send(accounts[message.accountId]);
        }
        await saveFilterClasses(classes);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllClassLevels(message) {
    try {
        const accounts = await getAccounts();
        const classes = await getFilterClasses();
        const result = await classes.sendAll(accounts, message.force);
        await saveFilterClasses(classes);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function refreshAllClassLevels() {
    try {
        await loadFilterClasses(true);
    } catch (e) {
        console.error(e);
    }
}

async function getFilterBooks() {
    try {
        if (filterBooksState === null) {
            const state = await config.session.get("filterBooksState");
            const accounts = await getAccounts();
            filterBooksState = new FilterBooks(state, accounts);
        }
        return filterBooksState;
    } catch (e) {
        console.error(e);
    }
}

async function loadFilterBooks(force = false) {
    try {
        const accounts = await getAccounts();
        const books = await getFilterBooks();
        for (const account of Object.values(accounts)) {
            await books.get(account, force);
        }
        await saveFilterBooks(books);
    } catch (e) {
        console.error(e);
    }
}

async function saveFilterBooks(filterBooks) {
    try {
        filterBooksState = filterBooks;
        await config.session.set("filterBooksState", filterBooks.state());
    } catch (e) {
        console.error(e);
    }
}

async function getAccountAddressBooks(message) {
    try {
        const accounts = await getAccounts();
        const filterBooks = await getFilterBooks();
        const books = await filterBooks.get(accounts[message.accountId]);
        return books;
    } catch (e) {
        console.error(e);
    }
}

async function setAccountAddressBooks(message) {
    try {
        const accounts = await getAccounts();
        const filterBooks = await getFilterBooks();
        const validationResult = await filterBooks.set(accounts[message.accountId], message.books);
        await saveFilterBooks(filterBooks);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAccountAddressBooks(message) {
    try {
        const accounts = await getAccounts();
        const filterBooks = await getFilterBooks();
        let validationResult = await filterBooks.set(accounts[message.accountId], message.books);
        if (validationResult.valid) {
            validationResult = await filterBooks.send(accounts[message.accountId]);
        }
        await saveFilterBooks(filterBooks);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllAddressBooks(message) {
    try {
        const accounts = await getAccounts();
        const filterBooks = await getFilterBooks();
        const result = await filterBooks.sendAll(accounts, message.force);
        await saveFilterBooks(filterBooks);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function refreshAllAddressBooks() {
    try {
        await loadFilterBooks(true);
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
        const classes = await getFilterClasses();
        const result = await classes.setDefaultItems(accounts[message.accountId]);
        await saveFilterClasses(classes);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handlePortMessage(message, sender) {
    try {
        console.log("background port received:", message.id);
        console.debug("background port received message:", message);
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
        var id = message.accountId;
        if (!id) {
            id = await getSelectedAccountId();
        }
        const accounts = await getAccounts();
        const account = accounts[message.accountId];
        var command = message.command.trim();
        if (message.argument) {
            command += " " + message.argument.trim();
        }
        return await sendEmailRequest(account, command, message.body);
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
    } catch (e) {
        console.error(e);
    }
}

requests.addHandler("setClassLevels", setClassLevels);
requests.addHandler("getClassLevels", getClassLevels);
requests.addHandler("sendClassLevels", sendClassLevels);
requests.addHandler("sendAllClassLevels", sendAllClassLevels);
requests.addHandler("refreshAllClassLevels", refreshAllClassLevels);

requests.addHandler("setAccountAddressBooks", setAccountAddressBooks);
requests.addHandler("getAccountAddressBooks", getAccountAddressBooks);
requests.addHandler("sendAccountAddressBooks", sendAccountAddressBooks);
requests.addHandler("sendAllAddressBooks", sendAllAddressBooks);
requests.addHandler("refreshAllAddressBooks", refreshAllAddressBooks);

requests.addHandler("getAccounts", getAccounts);
requests.addHandler("getSelectedAccountId", getSelectedAccountId);
requests.addHandler("setDefaultLevels", setDefaultLevels);
requests.addHandler("sendCommand", sendCommand);
requests.addHandler("setConfigValue", setConfigValue);
requests.addHandler("getConfigValue", getConfigValue);

browser.runtime.onStartup.addListener(handleStartup);
browser.runtime.onInstalled.addListener(handleInstalled);
browser.runtime.onSuspend.addListener(handleSuspend);
browser.runtime.onSuspendCanceled.addListener(handleSuspendCanceled);
browser.menus.onClicked.addListener(handleMenuClick);
browser.runtime.onConnect.addListener(handleConnect);

console.log("background page loaded");
