import { FilterClasses, FilterBooks } from "./classes.js";
import * as requests from "./requests.js";
import { config } from "./config.js";
import { Accounts } from "./accounts.js";
import * as ports from "./ports.js";
import { findEditorTab } from "./common.js";
import { sendEmailRequest, getMessageHeaders } from "./email.js";

/* globals messenger, console */

// FIXME: test when no imap accounts are present
// FIXME  test when no domains are selected

// control flags
const verbose = true;

// Menus, Classes, Filterbooks data management objects
let classesState = null;
let filterBooksState = null;
let accounts = new Accounts();

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
//  menu handlers
//
///////////////////////////////////////////////////////////////////////////////

let menu = {
    rmfMailFilter: {
        properties: {
            title: "Mail Filter",
            contexts: ["tools_menu", "folder_pane"],
        },
        shown: initMailFilterSubmenu,
        clicked: onMenuMailFilter,
    },
    rmfSelectedAccount: {
        properties: {
            title: "Selected Account",
            contexts: ["action_menu", "tools_menu", "folder_pane"],
        },
        shown: initSelectedAccountSubmenu,
    },
    rmfSelectAccount: {
        properties: {
            title: "__account_name__",
            contexts: ["action_menu", "tools_menu", "folder_pane"],
        },
        clicked: onMenuSelectAccount,
        noInit: true,
    },
    rmfSelectedFilterBook: {
        properties: {
            title: "Selected Filter Book",
            contexts: ["action_menu", "tools_menu", "folder_pane"],
        },
        shown: initSelectedFilterBookSubmenu,
    },
    rmfSelectFilterBook: {
        properties: {
            title: "__book_name__",
            contexts: ["action_menu", "tools_menu", "folder_pane"],
        },
        clicked: onMenuSelectFilterBook,
        noInit: true,
    },
    rmfAddSenderToFilterBook: {
        properties: {
            title: "Add Sender To Filter Book",
            contexts: ["message_display_action_menu", "message_list"],
        },
        shown: initAddSenderSubmenu,
        clicked: onMenuAddSenderToFilterBook,
    },
    rmfConnectFilterBooks: {
        properties: {
            title: "Show Filter Books",
            contexts: ["all"],
        },
        shown: onMenuAddressBookShown,
        clicked: onMenuConnectFilterBooks,
    },
    rmfControlPanel: {
        properties: {
            title: "Control Panel",
            contexts: ["action_menu", "tools_menu"],
        },
        clicked: onMenuControlPanel,
    },
    rmfTest: {
        properties: {
            title: "__test__",
            contexts: ["action_menu", "tools_menu"],
        },
        clicked: onMenuTest,
        noInit: true,
    },
};

async function updateMenu(id, properties) {
    try {
        if (verbose) {
            console.log("updateMenu:", id, properties);
        }
        properties.id = id;
        let menuId = await messenger.menus.create(properties);
        console.log("updateMenu: created:", properties);
        console.assert(menuId === properties.id, "unexpected menuId:", { menuId: menuId, properties: properties, config: config });
    } catch (e) {
        console.error(e);
    }
}

async function initMenus() {
    try {
        for (let [id, config] of Object.entries(menu)) {
            if (!config.noInit) {
                await updateMenu(id, config.properties);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMenuSelectAccount(info, tabs) {
    try {
        console.log("onMenuSelectAccount:", info, tabs);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuSelectFilterBook(info, tabs) {
    try {
        console.log("onMenuSelectFilterBook:", info, tabs);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuAddressBookShown(info, tabs) {
    try {
        console.log("onMenuAddressBookShown:", info, tabs);
    } catch (e) {
        console.error(e);
    }
}

// determine account id from menu click context info
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
            let account = await accounts.get(accountId);
            if (account) {
                console.log("menuContextAccountId: setting selected account:", account);
                await accounts.setSelected(account);
            }
        }
        return accountId;
    } catch (e) {
        console.error(e);
    }
}

// determine filter book from menu click context info
async function menuContextFilterBook(info) {
    try {
        if (verbose) {
            console.debug("menuContextFilterBook:", info);
        }
        let filterBook = null;
        return filterBook;
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
        if (menu[info.menuItemId] && menu[info.menuItemId].clicked) {
            console.debug("calling menu clicked handler:", { menu: menu[info.menuItemId], info: info });
            await menu[info.menuItemId].clicked(info);
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
        if (info.menuIds.length == 0) {
            for (let context of info.contexts) {
                switch (context) {
                    case "action_menu":
                        await initMenus();
                        break;
                    case "all":
                        break;
                    default:
                        console.error("onMenuShown: unhandled init context:", context, info);
                        break;
                }
            }
        } else {
            for (let menuId of info.menuIds) {
                if (menu[menuId] && menu[menuId].shown) {
                    console.debug("calling menu shown handler:", { menu: menu[menuId], info: info });
                    await menu[menuId].shown(menuId, info, tab);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

let clickCount = 0;

// called from onShown event
async function initMailFilterSubmenu(menuId, info, tab) {
    try {
        let accountId = await menuContextAccountId(info);
        let filterBook = await menuContextFilterBook(info);
        if (verbose) {
            console.log("initMailFilterSubmenu:", {
                menu: menu[menuId],
                info: info,
                tab: tab,
                accountId: accountId,
                filterBook: filterBook,
            });
        }
        ++clickCount;
        for (let i = 0; i < clickCount; i++) {
            let id = "rmfTest_" + clickCount;
            let properties = menu.rmfTest.properties;
            properties.title = "click_" + clickCount;
            await updateMenu(id, properties);
        }
        await messenger.menus.refresh();
    } catch (e) {
        console.error(e);
    }
}

async function initSelectedAccountSubmenu(menuId, info, tab) {
    try {
        if (verbose) {
            console.debug("initSelectedAccountSubmenu:", menuId, info, tab);
        }
        let selectedAccount = await accounts.getSelected();
        for (let [accountId, account] of Object.entries(await accounts.all())) {
            let id = "rmfSelectedAccount_" + accountId;
            let properties = menu.rmfSelectedAccount.properties;
            properties.title = account.name;
            properties.visible = accountId == selectedAccount.id;
            properties.checked = properties.visible && account.id === selectedAccount.id;
            properties.type = "checkbox";
            properties.parentId = menuId;
            await updateMenu(id, properties);
        }
        await messenger.menus.refresh();
    } catch (e) {
        console.error(e);
    }
}

async function initSelectedFilterBookSubmenu(menuId, info, tab) {
    try {
        if (verbose) {
            console.debug("initSelectedFilterBookSubmenu:", menuId, info, tab);
        }
        let selectedAccount = await accounts.getSelected();
        let filterBooks = await getFilterBooks();
        console.log("initSelectedFilterBooksSubmenu:", {
            selectedAccount: selectedAccount,
            filterBooks: filterBooks,
        });

        for (let [accountId, account] of Object.entries(await accounts.all())) {
            let books = filterBooks.get(account);
            let selectedBook = await accounts.getSelectedFilterBook(account);
            console.log("initSelectedFilterBooksSubmenu:", {
                accountId: accountId,
                books: books,
                selectedBook: selectedBook,
            });
            for (let book of books) {
                let id = "rmfSelectedFilterBook_" + accountId + "_" + book.name;
                let properties = menu.rmfSelectedFilterBook.properties;
                properties.title = book.name;
                properties.visible = account.id === selectedAccount.id;
                properties.checked = properties.visible && book.name === selectedBook.name;
                properties.type = "checkbox";
                properties.parentId = menuId;
                await updateMenu(id, properties);
            }
        }
        await messenger.menus.refresh();
    } catch (e) {
        console.error(e);
    }
}

async function initAddSenderSubmenu(menuId, info, tab) {
    try {
        if (verbose) {
            console.debug("initAddSenderSubmenu:", menuId, info, tab);
        }
        /*
        let accounts = await getAccounts();
        let selectedAccount = await getSelectedAccount();
        for (let [id, account] of Object.entries(accounts)) {
            let menuId = "rmfSelectedAccount_" + id;
            let properties = menu.rmfSelectedAccount.properties;
            properties.title = account.name;
            properties.checked = account.id === selectedAccount.id;
            properties.type = "checkbox";
            await updateMenu(id, properties);
        }
        await messenger.menus.refresh();
	*/
    } catch (e) {
        console.error(e);
    }
}

async function onMenuMailFilter(info, tab) {
    try {
        if (verbose) {
            console.log("onMenuMailFilter clicked:", { info: info, tab: tab });
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMenuTest(info) {
    try {
        console.log("onMenuTest clicked", info);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuControlPanel(info) {
    try {
        console.log("onMenuControlPanel clicked:", info);
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

async function onMenuConnectFilterBooks(info) {
    try {
        console.log("onMenuConnectFilterBooks:", info);
        let books = getConnectedFilterBooks();
        for (let book of books) {
            console.log("book:", book);
        }
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
            const account = await accounts.get(message.folder.accountId);
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
        const classes = await getFilterClasses();
        for (const account of Object.values(await accounts.all())) {
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
            classesState = new FilterClasses(state, await accounts.all(), await findEditorTab());
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
        const account = await accounts.get(message.accountId);
        const classes = await getFilterClasses();
        const levels = await classes.get(account);
        return levels;
    } catch (e) {
        console.error(e);
    }
}

async function setClassLevels(message) {
    try {
        const account = await accounts.get(message.accountId);
        const classes = await getFilterClasses();
        const validationResult = await classes.set(account, message.levels);
        await saveFilterClasses(classes);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendClassLevels(message) {
    try {
        const account = await accounts.get(message.accountId);
        const classes = await getFilterClasses();
        let validationResult = await classes.set(account, message.levels);
        if (validationResult.valid) {
            validationResult = await await classes.send(account);
        }
        await saveFilterClasses(classes);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllClassLevels(message) {
    try {
        const classes = await getFilterClasses();
        const result = await classes.sendAll(await accounts.all(), message.force);
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
        const account = await accounts.get(message.accountId);
        const classes = await getFilterClasses();
        const result = await classes.setDefaultItems(account);
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
            filterBooksState = new FilterBooks(state, accounts, await findEditorTab());
        }
        return filterBooksState;
    } catch (e) {
        console.error(e);
    }
}

async function loadFilterBooks(force = false) {
    try {
        const books = await getFilterBooks();
        for (const account of Object.values(accounts.all())) {
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
        const account = await accounts.get(message.accountId);
        const filterBooks = await getFilterBooks();
        const books = await filterBooks.get(account);
        return books;
    } catch (e) {
        console.error(e);
    }
}

async function setAccountAddressBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterBooks = await getFilterBooks();
        const validationResult = await filterBooks.set(account, message.books);
        await saveFilterBooks(filterBooks);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAccountAddressBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterBooks = await getFilterBooks();
        let validationResult = await filterBooks.set(account, message.books);
        if (validationResult.valid) {
            validationResult = await filterBooks.send(account);
        }
        await saveFilterBooks(filterBooks);
        return validationResult;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllAddressBooks(message) {
    try {
        const filterBooks = await getFilterBooks();
        const result = await filterBooks.sendAll(await accounts.all(), message.force);
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

async function handleGetAccounts() {
    try {
        return accounts.all();
    } catch (e) {
        console.error(e);
    }
}

async function handleGetSelectedAccount() {
    try {
        return accounts.selected();
    } catch (e) {
        console.error(e);
    }
}

async function handleSetSelectedAccount(message) {
    try {
        return accounts.select(message.account);
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
        let account = undefined;
        if (message.accountId !== undefined) {
            account = await accounts.get(message.accountId);
        } else {
            account = await accounts.getSelected();
        }
        var command = message.command.trim();
        if (message.argument) {
            command += " " + message.argument.trim();
        }
        return await sendEmailRequest(account, command, message.body, message.timeout, await findEditorTab());
    } catch (e) {
        console.error(e);
    }
}

async function handleSetActiveDomains(message) {
    try {
        return await accounts.setDomains(message.domains);
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

async function getConnectedFilterBooks() {
    try {
        console.log("getConnectedFilterBooks");
        const books = await messenger.cardDAV.getBooks();
        console.log("connected cardDAV books:", books);
        return books;
    } catch (e) {
        console.error(e);
    }
}

/*
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
requests.addHandler("getAccounts", handleGetAccounts);
requests.addHandler("getSelectedAccount", handleGetSelectedAccount);
requests.addHandler("setSelectedAccount", handleSetSelectedAccount);

requests.addHandler("getAccountDomains", accounts.domains);
requests.addHandler("getActiveDomains", accounts.activeDomains);
requests.addHandler("setActiveDomains", handleSetActiveDomains);

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
