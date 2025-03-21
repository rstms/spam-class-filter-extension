import { FilterClasses, FilterBooks } from "./classes.js";
import * as requests from "./requests.js";
import { config } from "./config.js";
import * as ports from "./ports.js";
import { domainPart, findEditorTab } from "./common.js";
import { sendEmailRequest, getMessageHeaders } from "./email.js";

/* globals messenger, console */

// FIXME: test when no imap accounts are present
// FIXME  test when no domains are selected

// control flags
const verbose = false;
var menusCreated = false;

// Classes, Filterbooks data management objects
var classesState = null;
var filterBooksState = null;

///////////////////////////////////////////////////////////////////////////////
//
//  startup and suspend state management
//
///////////////////////////////////////////////////////////////////////////////

async function initialize(mode) {
    try {
        if (verbose) {
            console.log("background initialize:", mode);
        }
        const manifest = await messenger.runtime.getManifest();
        switch (mode) {
            case "installed":
                if (await config.local.get("autoClearConsole")) {
                    console.clear();
                }
                console.log(manifest.name + " v" + manifest.version);
                console.log("configuration:", await config.local.get());
                break;
        }
        await initActiveDomains();
        await initMenus();
        const autoOpen = await config.local.get("autoOpen");
        if (autoOpen) {
            if (autoOpen === "once") {
                await config.local.remove("autoOpen");
            }
            await focusEditorWindow();
        }
    } catch (e) {
        console.error(e);
    }
}

async function onStartup() {
    try {
        await initialize("startup");
    } catch (e) {
        console.error(e);
    }
}

async function onInstalled() {
    try {
        await initialize("installed");
    } catch (e) {
        console.error(e);
    }
}

async function onSuspend() {
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

async function onSuspendCanceled() {
    try {
        await initialize("suspendCanceled");
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  account data and selected account management
//
///////////////////////////////////////////////////////////////////////////////

function defaultAccount(accounts) {
    try {
        const keys = Object.keys(accounts).sort();
        return accounts[keys[0]];
    } catch (e) {
        console.error(e);
    }
}

// NOTE: side effect: resets selectedAccount if the domain is not in the set of active domains
async function getAccounts() {
    try {
        const accountList = await messenger.accounts.list();
        const selectedAccount = await config.session.get("selectedAccount");
        //const domains = await config.local.get("domain");
        const domains = await getActiveDomains();
        var selectedDomain = null;
        if (selectedAccount) {
            selectedDomain = domainPart(selectedAccount);
        }
        var accounts = {};
        for (const account of accountList) {
            if (account.type === "imap") {
                const domain = domainPart(account.identities[0].email);
                if (domains[domain]) {
                    accounts[account.id] = account;
                    if (domain === selectedDomain) {
                        selectedDomain = domain;
                    }
                }
            }
        }
        if (selectedAccount && !selectedDomain) {
            const original = selectedAccount;
            await setSelectedAccount(defaultAccount(accounts));
            console.warning("selected account not active, changing:", { original: original, current: selectedAccount });
        }
        return accounts;
    } catch (e) {
        console.error(e);
    }
}

async function getAccount(accountId) {
    try {
        const accounts = await getAccounts();
        return accounts[accountId];
    } catch (e) {
        console.error(e);
    }
}

async function getSelectedAccount() {
    try {
        let selectedAccount = await config.session.get("selectedAccount");
        if (!selectedAccount) {
            const accounts = await getAccounts();
            selectedAccount = defaultAccount(accounts);
        }
        return selectedAccount;
    } catch (e) {
        console.error(e);
    }
}

// NOTE: returns default account if specified account is not enabled
// TODO: this needs to inform the editor
async function setSelectedAccount(account) {
    try {
        await config.session.set("selectedAccount", account);
        return await getSelectedAccount();
    } catch (e) {
        console.error(e);
    }
}

async function getSelectedAccountId() {
    try {
        const account = await getSelectedAccount();
        const id = account.id;
        if (verbose) {
            console.debug("getSelectedAccountId returning:", id);
        }
        return id;
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  enabled account domain management
//
///////////////////////////////////////////////////////////////////////////////

async function initActiveDomains() {
    try {
        // get config domains
        const configDomains = await getAccountDomains();

        // list unique domains from all imap accounts
        const accountList = await messenger.accounts.list();
        var domains = {};
        for (const account of accountList) {
            if (account.type === "imap") {
                domains[domainPart(account.identities[0].email)] = true;
            }
        }

        // set enabled values of all domains present in accountList
        for (const domain of Object.keys(domains)) {
            domains[domain] = configDomains[domain] === true ? true : false;
        }

        await setActiveDomains({ domains: domains });

        console.log("domains:", { accounts: accountList, config: configDomains, control: domains });

        return domains;
    } catch (e) {
        console.error(e);
    }
}

async function getAccountDomains() {
    try {
        return await config.local.get("domain");
    } catch (e) {
        console.error(e);
    }
}

async function getActiveDomains() {
    try {
        const domains = await getAccountDomains();
        const activeDomains = {};
        for (const [domain, active] of Object.entries(domains)) {
            if (active) {
                activeDomains[domain] = true;
            }
        }
        return activeDomains;
    } catch (e) {
        console.error(e);
    }
}

async function setActiveDomains(message) {
    try {
        await config.local.set("domain", message.domains);
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  menu handlers
//
///////////////////////////////////////////////////////////////////////////////

let menu = {
    rmfMailFilter: {
        text: "Mail Filter",
        shown: initSubmenu,
    },
    rmfSelectFilterBook: {
        text: "Select Filter Book",
        shown: initSubmenu,
    },
    rmfAccounts: {
        text: "Account",
        shown: initSubmenu,
    },
    rmfAccount: {
        text: "__account__",
        clicked: onMenuAccount,
    },
    rmfControlPanel: {
        text: "Control Panel",
        clicked: onMenuControlPanel,
    },
    rmfAddSenderToFilterBook: {
        text: "Add Sender To Filter Book",
        clicked: onMenuAddSenderToFilterBook,
        shown: initSubmenu,
    },
    rmfFilterBook: {
        text: "__filterbook__",
        clicked: onMenuFilterBook,
    },
    rmfEditFilterbook: {
        text: "Add Filter Book",
        shown: initSubmenu,
    },
    rmfDisconnectAll: {
        text: "Remove Filter Book Connections",
        clicked: onMenuRemoveFilterBookConnections,
    },
    rmfTest: {
        text: "test menu item",
        clickedt: onMenuTest,
    },
};

async function initMenus() {
    try {
        if (!menusCreated) {
            await messenger.menus.create({
                id: "rmfMailFilter",
                title: menu.rmfMailFilter.text,
                contexts: ["action_menu", "tools_menu", "folder_pane"],
            });
            await messenger.menus.create({
                id: "rmfAddSenderToFilterBook",
                title: menu.rmfAddSenderToFilterBook.text,
                contexts: ["message_list", "message_display_action_menu", "page", "frame"], // FIXME: do we need page, frame?
            });
            menusCreated = true;
        }
    } catch (e) {
        console.error(e);
    }
}

// determine account id from menu click context
async function menuContextAccountId(info) {
    try {
        let accountId = null;
        if (info.selectedFolders !== undefined) {
            // FIXME: handle multiple selected folders
            console.assert(info.selectedFolders.length == 1, "not handling multiple selected folders");
            for (let folder of info.selectedFolders) {
                accountId = folder.accountId;
            }
        } else if (info.selectedMessages !== undefined) {
            // FIXME: handle mutiple selected messags
            console.assert(info.selectedMessages.length == 1, "not handling multiple selected messages");
            for (let message of info.selectedMessages) {
                //accountId = message.accountId;
                throw new Error("parse accountID from message", message);
            }
        }
        if (accountId) {
            let account = await getAccount(accountId);
            if (account) {
                console.log("menuContextAccountId: setting selected account:", account);
                await setSelectedAccount(account);
            }
        }
        return accountId;
    } catch (e) {
        console.error(e);
    }
}

// if opt-in not approved, divert to extension options panel and return false
async function optInApproved() {
    try {
        if (!(await config.local.get("optInApproved"))) {
            await messenger.runtime.openOptionsPage();
            return false;
        }
        return true;
    } catch (e) {
        console.error(e);
    }
}

async function onMenuClick(info, tab) {
    try {
        if (verbose) {
            console.debug("onMenuClick:", { info: info, tab: tab });
        }
        if (menu[info.menuItemId]) {
            let handler = menu[info.menuItemId].clicked;
            if (handler) {
                console.debug("calling menu clicked handler:", { menu: menu, info: info });
                await menu.handler(info);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMenuShown(info, tab) {
    try {
        if (verbose) {
            console.debug("onMenuShown:", { info: info, tab: tab });
        }
        if (menu[info.menuItemId]) {
            let handler = menu[info.menuItemId].shown;
            if (handler) {
                console.debug("calling menu shown handler:", { menu: menu, info: info });
                await handler(info);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

let clickCount = 0;

async function initSubmenu(info) {
    try {
        if (verbose) {
            console.debug("initSubmenu:", { info: info });
        }
        let accountId = await menuContextAccountId(info);
        console.log("initSubmenu: accountId", accountId);
        let changed = false;
        switch (info.menuItemId) {
            case menu.rmfMailFilter:
                await messenger.menus.Create({
                    id: "rmfTest",
                    title: "click_" + ++clickCount,
                    contexts: info.contexts,
                    parentId: info.menuItemId,
                });
                changed = true;
                break;
            default:
                console.error("unhandled initSubmenu:", info.menuItemId, info);
                break;
        }
        if (changed) {
            await messenger.menus.refresh();
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMenuTest(info) {
    try {
        console.log("menu clicked test", info);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuControlPanel(info) {
    try {
        console.log("menu clicked control panel", info);
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

async function onMenuAccount(info) {
    try {
        console.log("menu clicked account", info);
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

async function onMenuFilterBook(info) {
    try {
        console.log("menu clicked filter book", info);
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

async function onMenuRemoveFilterBookConnections(info) {
    try {
        console.log("menu clicked remove filter book connections", info);
    } catch (e) {
        console.error(e);
    }
}

async function getEditorPort(wait) {
    try {
        if (verbose) {
            console.log("awaiting editor port connection...");
        }
        var port = await ports.get("editor", ports, wait);
        if (verbose) {
            console.log("detected editor port connection");
        }
        return port;
    } catch (e) {
        console.error(e);
    }
}

async function focusEditorWindow(sendAccountId) {
    try {
        if (verbose) {
            console.debug("focusEditorWindow");
        }

        if (!(await optInApproved())) {
            return;
        }

        var editorTab = await findEditorTab();
        if (verbose) {
            console.debug("editor tab:", editorTab);
        }
        var port = await ports.get("editor", ports.NO_WAIT);
        if (verbose) {
            console.debug("editor port:", port);
        }

        if (editorTab) {
            await messenger.tabs.update(editorTab.id, { active: true });
            if (!port) {
                // editor is open but port is null; assume we're coming back from being suspended
                if (verbose) {
                    console.log("sending activated notification");
                }
                messenger.runtime.sendMessage({ id: "backgroundActivated" });
                if (verbose) {
                    console.log("activated notificaton sent");
                }
            }
        } else {
            await messenger.tabs.create({ url: "./editor.html" });
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

///////////////////////////////////////////////////////////////////////////////
//
//  Address Book Filter actions
//
///////////////////////////////////////////////////////////////////////////////

async function onMenuAddSenderToFilterBook(info, tab) {
    try {
        console.log("onMenuAddSenderToFilterBook:", { info: info, tab: tab });
        const messageList = await messenger.messageDisplay.getDisplayedMessages(tab.id);
        console.log("messageList:", messageList);
        for (const message of messageList.messages) {
            const account = await getAccount(message.folder.accountId);
            const headers = await getMessageHeaders(message);
            console.log({ account: account, author: message.author, message: message, headers: headers });
            const selectedBookName = "testbook";
            var sender = String(message.author)
                .replace(/^[^<]*</g, "")
                .replace(/>.*$/g, "");
            const command = "mkaddr " + selectedBookName + " " + sender;
            const response = await sendEmailRequest(account, command);
            console.log({ response: response });
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMessageDisplayActionClicked(tab, info) {
    try {
        console.log("message display action clicked, relaying to menu clicked handler");
        await onMenuAddSenderToFilterBook(info, tab);
    } catch (e) {
        console.error(e);
    }
}

messenger.messageDisplayAction.onClicked.addListener(onMessageDisplayActionClicked);

///////////////////////////////////////////////////////////////////////////////
//
//  FilterClasses data management
//
///////////////////////////////////////////////////////////////////////////////

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
            classesState = new FilterClasses(state, accounts, await findEditorTab());
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

///////////////////////////////////////////////////////////////////////////////
//
//  FilterBooks data management
//
///////////////////////////////////////////////////////////////////////////////

// return new or cached FilterBooks object
async function getFilterBooks() {
    try {
        if (filterBooksState === null) {
            const state = await config.session.get("filterBooksState");
            const accounts = await getAccounts();
            filterBooksState = new FilterBooks(state, accounts, await findEditorTab());
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

///////////////////////////////////////////////////////////////////////////////
//
//  runtime and requests message and connnection handlers
//
///////////////////////////////////////////////////////////////////////////////

async function onRuntimeMessage(message, sender, callback) {
    try {
        if (verbose) {
            console.debug("background listener received:", message.id);
            console.debug("background listener received message:", message, sender, callback);
        }
        switch (message.id) {
            case "focusEditorWindow":
                await focusEditorWindow(message.accountId);
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

// requests port message handler
async function onPortMessage(message, sender) {
    try {
        if (verbose) {
            console.log("background port received:", message.id);
            console.debug("background port received message:", message);
        }
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

async function onPortDisconnect(port) {
    try {
        if (verbose) {
            console.debug("background got disconnect:", port);
        }
        ports.remove(port);
    } catch (e) {
        console.error(e);
    }
}

async function onPortConnect(port) {
    try {
        if (verbose) {
            console.debug("background got connection:", port);
        }
        ports.add(port);
        port.onMessage.addListener(onPortMessage);
        port.onDisconnect.addListener(onPortDisconnect);
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  runtime and requests RPC handlers
//
///////////////////////////////////////////////////////////////////////////////

async function handleSetSelectedAccountId(message) {
    try {
        const accounts = await getAccounts();
        if (!accounts[message.accountId]) {
            throw new Error("unknown accountId:", { message: message, accounts: accounts });
        }
        const account = await setSelectedAccount(account);
        return account.id;
    } catch (e) {
        console.error(e);
    }
}

async function handleGetConfigValue(message) {
    try {
        return await config.local.get(message.key);
    } catch (e) {
        console.error(e);
    }
}

async function handleSetConfigValue(message) {
    try {
        await config.local.set(message.key, message.value);
    } catch (e) {
        console.error(e);
    }
}

async function handleResetConfigToDefaults(message) {
    try {
        if (verbose) {
            config.debug("resetConfigToDefaults:", message);
        }
        config.log;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendCommand(message) {
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
        return await sendEmailRequest(account, command, message.body, message.timeout, await findEditorTab());
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  DOM and API event handlers
//
///////////////////////////////////////////////////////////////////////////////

async function onWindowCreated(info) {
    try {
        console.log("onWindowCreated:", info);
    } catch (e) {
        console.error(e);
    }
}

async function onTabCreated(tab) {
    try {
        console.log("onTabCreated:", tab);
    } catch (e) {
        console.error(e);
    }
}

async function onTabActivated(tab) {
    try {
        console.log("onTabActivated:", tab);
    } catch (e) {
        console.error(e);
    }
}

//var uriMenuId = null;
//var passwdMenuId = null;

async function onTabUpdated(tabId, changeInfo, tab) {
    try {
        console.log("onTabUpdated:", { tabId: tabId, changeInfo: changeInfo, tab: tab });
        if (tab.status === "complete" && tab.type === "addressBook") {
            console.log("address book tab opened");
        }
    } catch (e) {
        console.error(e);
    }
}

async function onTabRemoved(tabId, removeInfo) {
    try {
        console.log("onTabRemoved:", { tabId: tabId, removeInfo: removeInfo });
    } catch (e) {
        console.error(e);
    }
}

/*
async function listAddressBooks() {
    try {
        console.log("listAddressBooks");
        const books = await messenger.cardDAV.getBooks();
        console.log("cardDAV books:", books);
        return books;
    } catch (e) {
        console.error(e);
    }
}

async function createAddressBook() {
    try {
        console.log("createAddressBook");
        const newBook = await messenger.cardDAV.connect(
            "testbook",
            "https://rolodex.rstms.net:4443/dav.php/addressbooks/mkrueger@rstms.net/mkrueger-rstms-net-testbook/",
            "mkrueger@rstms.net",
            "c5215864be60f9bdadf0eef0",
        );
        console.log("newBook:", newBook);
    } catch (e) {
        console.error(e);
    }
}
*/

///////////////////////////////////////////////////////////////////////////////
//
//  event wiring
//
///////////////////////////////////////////////////////////////////////////////

// requests message handlers
requests.addHandler("getAccounts", getAccounts);
requests.addHandler("getSelectedAccountId", getSelectedAccountId);
requests.addHandler("setSelectedAccountId", handleSetSelectedAccountId);

requests.addHandler("getAccountDomains", getAccountDomains);
requests.addHandler("getActiveDomains", getActiveDomains);
requests.addHandler("setActiveDomains", setActiveDomains);

requests.addHandler("setClassLevels", setClassLevels);
requests.addHandler("getClassLevels", getClassLevels);
requests.addHandler("sendClassLevels", sendClassLevels);
requests.addHandler("sendAllClassLevels", sendAllClassLevels);
requests.addHandler("refreshAllClassLevels", refreshAllClassLevels);
requests.addHandler("setDefaultLevels", setDefaultLevels);

requests.addHandler("setAccountAddressBooks", setAccountAddressBooks);
requests.addHandler("getAccountAddressBooks", getAccountAddressBooks);
requests.addHandler("sendAccountAddressBooks", sendAccountAddressBooks);
requests.addHandler("sendAllAddressBooks", sendAllAddressBooks);
requests.addHandler("refreshAllAddressBooks", refreshAllAddressBooks);

requests.addHandler("setConfigValue", handleSetConfigValue);
requests.addHandler("getConfigValue", handleGetConfigValue);
requests.addHandler("resetConfigToDefaults", handleResetConfigToDefaults);

requests.addHandler("sendCommand", handleSendCommand);

// API event handlers
messenger.runtime.onStartup.addListener(onStartup);
messenger.runtime.onInstalled.addListener(onInstalled);
messenger.runtime.onSuspend.addListener(onSuspend);
messenger.runtime.onSuspendCanceled.addListener(onSuspendCanceled);
messenger.runtime.onConnect.addListener(onPortConnect);
messenger.runtime.onMessage.addListener(onRuntimeMessage);

messenger.windows.onCreated.addListener(onWindowCreated);

messenger.tabs.onCreated.addListener(onTabCreated);
messenger.tabs.onActivated.addListener(onTabActivated);
messenger.tabs.onUpdated.addListener(onTabUpdated);
messenger.tabs.onRemoved.addListener(onTabRemoved);

messenger.menus.onClicked.addListener(onMenuClick);
messenger.menus.onShown.addListener(onMenuShown);

console.log("background page loaded");
