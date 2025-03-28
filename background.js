import { config } from "./config.js";
import { Accounts } from "./accounts.js";
import * as ports from "./ports.js";
import { findEditorTab } from "./common.js";
import { sendEmailRequest, getMessageHeaders } from "./email.js";
import { generateUUID } from "./common.js";
import { FilterDataController } from "./filterctl.js";

/* globals messenger, console */

// FIXME: test when no imap accounts are present
// FIXME  test when no domains are selected

// control flags
const verbose = false;

let accounts = null;

let pendingConnections = new Map();
const backgroundId = "background-" + generateUUID();

let filterctlState = null;

///////////////////////////////////////////////////////////////////////////////
//
//  startup and suspend state management
//
///////////////////////////////////////////////////////////////////////////////

async function initialize(mode) {
    try {
        const manifest = await messenger.runtime.getManifest();
        console.log(manifest.name + " v" + manifest.version + " (" + mode + ")");
        switch (mode) {
            case "Installed":
                if (await config.local.get("autoClearConsole")) {
                    console.clear();
                }
                if (verbose) {
                    console.log("configuration:", await config.local.get());
                }
                break;
            default:
                console.log("FIXME");
                break;
        }
        if (accounts === null) {
            accounts = new Accounts();
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
        await initialize("Startup");
    } catch (e) {
        console.error(e);
    }
}

async function onInstalled() {
    try {
        await initialize("Installed");
    } catch (e) {
        console.error(e);
    }
}

async function onSuspend() {
    try {
        console.log("background suspending");
        await messenger.runtime.sendMessage({ id: "backgroundSuspending", src: backgroundId });
    } catch (e) {
        console.error(e);
    }
}

async function onSuspendCanceled() {
    try {
        await messenger.runtime.sendMessage({ id: "backgroundSuspendCanceled", src: backgroundId });
        //await initialize("SuspendCanceled");
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  messages handler
//
///////////////////////////////////////////////////////////////////////////////

async function onConnect(port) {
    try {
        if (verbose) {
            console.debug("onConnect:", port);
        }
        port.onMessage.addListener(onPortMessage);
        port.onDisconnect.addListener(onDisconnect);
        if (pendingConnections.has(port.name)) {
            console.warn("onConnect: pending connection exists:", port.name);
        }
        pendingConnections.set(port.name, port);
        console.log("background received connection request:", port.name);
        port.postMessage({ id: "ENQ", src: backgroundId, dst: port.name });

        if (verbose) {
            console.debug("returning from onConnect");
        }
    } catch (e) {
        console.error(e);
    }
}

async function onPortMessage(message, sender) {
    try {
        if (verbose) {
            console.debug("background.onPortMessage:", message, sender);
        }
        console.error("unexpected port message:", message, sender);
    } catch (e) {
        console.error(e);
    }
}

async function onMessage(message, sender) {
    try {
        if (verbose) {
            console.debug("background.onMessage:", message, sender);
        }

        let response = undefined;

        // process messages not requiring connection
        switch (message.id) {
            case "focusEditorWindow":
                await focusEditorWindow(message.accountId);
                return false;
        }

        if (message.src === undefined || message.dst === undefined) {
            console.error("missing src/dst, discarding:", message);
            return false;
        }

        if (message.dst !== backgroundId) {
            console.error("unexpected dst ID, discarding:", message);
            return false;
        }

        let port = undefined;

        if (message.id === "ACK") {
            port = pendingConnections.get(message.src);
        } else {
            port = ports.get(message.src, ports.NO_WAIT);
        }

        if (port === undefined) {
            console.error("unexpected src ID, discarding:", message);
            return false;
        }

        switch (message.id) {
            case "ACK":
                console.log("background accepted connection:", port.name);
                ports.add(port);
                pendingConnections.delete(port.name);
                response = { background: backgroundId };
                response[ports.portLabel(port)] = port.name;
                break;

            case "getAccounts":
                response = await accounts.get();
                break;
            case "getSelectedAccount":
                response = await accounts.selected();
                break;
            case "selectAccount":
                response = await accounts.select(message.account);
                break;
            case "getDomains":
                response = await accounts.domains();
                break;
            case "getEnabledDomains":
                response = await accounts.enabledDomains();
                break;
            case "setDomains":
                response = await accounts.setDomains(message.domains);
                break;
            case "enableDomain":
                response = await accounts.enableDomain(message.domain);
                break;
            case "disableDomain":
                response = await accounts.disableDomain(message.domain);
                break;
            case "setClasses":
                response = await handleSetClasses(message);
                break;
            case "getClasses":
                response = await handleGetClasses(message);
                break;
            case "sendClasses":
                response = await handleSendClasses(message);
                break;
            case "sendAllClasses":
                response = await handleSendAllClasses(message);
                break;
            case "refreshClasses":
                response = await handleRefreshClasses(message);
                break;
            case "refreshAllClasses":
                response = await handleRefreshAllClasses(message);
                break;
            case "setDefaultClasses":
                response = await handleSetDefaultClasses(message);
                break;
            case "setAccountAddressBooks":
                response = await setAccountAddressBooks(message);
                break;
            case "getAccountAddressBooks":
                response = await getAccountAddressBooks(message);
                break;
            case "sendAccountAddressBooks":
                response = await sendAccountAddressBooks(message);
                break;
            case "sendAllAddressBooks":
                response = await sendAllAddressBooks(message);
                break;
            case "refreshAllAddressBooks":
                response = await handleRefreshAllAddressBooks();
                break;
            case "setConfigValue":
                response = await handleSetConfigValue(message);
                break;
            case "getConfigValue":
                response = await handleGetConfigValue(message);
                break;
            case "resetConfigToDefaults":
                response = await handleResetConfigToDefaults(message);
                break;
            case "sendCommand":
                response = await handleSendCommand(message);
                break;
            case "getPassword":
                response = await handleGetPassword(message);
                break;
            default:
                console.error("background: received unexpected message:", message, sender);
                break;
        }
        if (response !== undefined) {
            if (typeof response !== "object") {
                response = { result: response };
            }
            console.debug("background.onMessage: sending response:", response);
        }
        return response;
    } catch (e) {
        console.error(e);
    }
}

async function onDisconnect(port) {
    try {
        if (verbose) {
            console.debug("onDisconnect:", port);
        }
        ports.remove(port);
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
        if (verbose) {
            console.log("updateMenu: created:", properties);
        }
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
        if (verbose) {
            console.log("onMenuSelectAccount:", info, tabs);
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMenuSelectFilterBook(info, tabs) {
    try {
        if (verbose) {
            console.log("onMenuSelectFilterBook:", info, tabs);
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMenuAddressBookShown(info, tabs) {
    try {
        if (verbose) {
            console.log("onMenuAddressBookShown:", info, tabs);
        }
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
                if (verbose) {
                    console.log("menuContextAccountId: setting selected account:", account);
                }
                await accounts.select(account);
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
            if (verbose) {
                console.debug("calling menu clicked handler:", { menu: menu[info.menuItemId], info: info });
            }
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
                    if (verbose) {
                        console.debug("calling menu shown handler:", { menu: menu[menuId], info: info });
                    }
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
        /*
        let selectedAccount = await accounts.selected();
        for (let [accountId, account] of Object.entries(await accounts.get())) {
            let id = "rmfSelectedAccount_" + accountId;
            let properties = menu.rmfSelectedAccount.properties;
            properties.title = accountEmail(account);
            properties.visible = accountId == selectedAccount.id;
            properties.checked = properties.visible && account.id === selectedAccount.id;
            properties.type = "checkbox";
            properties.parentId = menuId;
            await updateMenu(id, properties);
        }
        await messenger.menus.refresh();
	*/
    } catch (e) {
        console.error(e);
    }
}

async function initSelectedFilterBookSubmenu(menuId, info, tab) {
    try {
        if (verbose) {
            console.debug("initSelectedFilterBookSubmenu:", menuId, info, tab);
        }
        /*
        let selectedAccount = await accounts.selected();
        let filterctl = await getFilterDataController();
        if (verbose) {
            console.log("initSelectedFilterBooksSubmenu:", {
                selectedAccount: selectedAccount,
                filterctl: filterctl,
            });
        }

        for (let [accountId, account] of Object.entries(await accounts.get())) {
            let books = filterctl.getBooks(account);
            let selectedBook = await accounts.selectedFilterBook(account);
            if (verbose) {
                console.log("initSelectedFilterBooksSubmenu:", {
                    accountId: accountId,
                    books: books,
                    selectedBook: selectedBook,
                });
            }
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
	*/
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
            properties.title = accountEmail(account);
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

async function focusEditorWindow(sendAccountId = undefined) {
    try {
        if (verbose) {
            console.debug("focusEditorWindow:", sendAccountId);
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
                await messenger.runtime.sendMessage({ id: "backgroundActivated", src: backgroundId });
                if (verbose) {
                    console.log("activated notificaton sent");
                }
            }
        } else {
            await messenger.tabs.create({ url: "./editor.html" });
        }

        //if (!port) {
        //    port = await getEditorPort();
        //}

        // FIXME: try letting editor request what it needs
        //await requests.sendMessage(port, { id: "selectEditorTab", name: "classes" });
        //if (sendAccountId) {
        //    await requests.sendMessage(port, { id: "selectAccount", accountId: sendAccountId });
        //}
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
        if (verbose) {
            console.log("onMenuAddSenderToFilterBook:", { info: info, tab: tab });
        }
        const messageList = await messenger.messageDisplay.getDisplayedMessages(tab.id);
        if (verbose) {
            console.debug("messageList:", messageList);
        }
        for (const message of messageList.messages) {
            const account = await accounts.get(message.folder.accountId);
            const headers = await getMessageHeaders(message);
            if (verbose) {
                console.debug({ account: account, author: message.author, message: message, headers: headers });
            }
            const selectedBookName = "testbook";
            var sender = String(message.author)
                .replace(/^[^<]*</g, "")
                .replace(/>.*$/g, "");
            const command = "mkaddr " + selectedBookName + " " + sender;
            const response = await sendEmailRequest(account, command);
            if (verbose) {
                console.debug({ response: response });
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMessageDisplayActionClicked(tab, info) {
    try {
        if (verbose) {
            console.debug("message display action clicked, relaying to menu clicked handler");
        }
        await onMenuAddSenderToFilterBook(info, tab);
    } catch (e) {
        console.error(e);
    }
}

messenger.messageDisplayAction.onClicked.addListener(onMessageDisplayActionClicked);

///////////////////////////////////////////////////////////////////////////////
//
//  Filter Data Controller
//
///////////////////////////////////////////////////////////////////////////////

async function getFilterDataController() {
    try {
        if (filterctlState === null) {
            const state = await config.session.get("fdcState");
            filterctlState = new FilterDataController(await accounts.get(), state);
        }
        return filterctlState;
    } catch (e) {
        console.error(e);
    }
}

async function saveFilterData(filterctl) {
    try {
        await config.session.set("fdcState", filterctl.state());
    } catch (e) {
        console.error(e);
    }
}

async function getAccountAddressBooks(message) {
    try {
        const account = await accounts.get(message.account);
        const filterctl = await getFilterDataController();
        const force = message.force ? true : false;
        const books = await filterctl.getBooks(account, force);
        return books;
    } catch (e) {
        console.error(e);
    }
}

async function setAccountAddressBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        const result = await filterctl.setBooks(account, message.books);
        await saveFilterData(filterctl);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function sendAccountAddressBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        let result = await filterctl.setBooks(account, message.books);
        if (result.books.valid) {
            result = await filterctl.sendBooks(account);
        }
        await saveFilterData(filterctl);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function sendAllAddressBooks(message) {
    try {
        const filterctl = await getFilterDataController();
        const result = await filterctl.sendAllBooks(message.force);
        await saveFilterData(filterctl);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshAllAddressBooks() {
    try {
        const filterctl = await getFilterDataController();
        for (const account of Object.values(accounts.get())) {
            await filterctl.getBooks(account, true);
        }
        await saveFilterData(filterctl);
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  runtime message handlers
//
///////////////////////////////////////////////////////////////////////////////

/*
async function handleSelectAccount(message) {
    try {
        return accounts.select(message.account);
    } catch (e) {
        console.error(e);
    }
}
*/

async function handleGetClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        const classes = await filterctl.getClasses(account);
        return classes;
    } catch (e) {
        console.error(e);
    }
}

async function handleSetClasses(message) {
    try {
        console.debug("handleSetClasses:", message);
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        const result = await filterctl.setClasses(account, message.classes);
        await saveFilterData(filterctl);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        let setResult = await filterctl.setClassses(account, message.classes);
        let sendResult = undefined;
        console.debug("setClasses result:", setResult);
        if (setResult.classes.valid) {
            sendResult = await await filterctl.sendClasses(account);
            console.debug("filterctl.send result:", sendResult);
        }
        await saveFilterData(filterctl);
        return sendResult;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendAllClasses(message) {
    try {
        const filterctl = await getFilterDataController();
        const result = await filterctl.sendAllClasses(message.force);
        console.debug("sendAllClasses result:", result);
        await saveFilterData(filterctl);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        const result = await filterctl.getClasses(account, true);
        console.debug("getClasses result:", result);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshAllClasses() {
    try {
        const filterctl = await getFilterDataController();
        for (const account of Object.values(await accounts.get())) {
            await filterctl.getClasses(account, true);
        }
        await saveFilterData(filterctl);
    } catch (e) {
        console.error(e);
    }
}

async function handleSetDefaultClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        const result = await filterctl.setClassesDefaults(account);
        console.debug("setDefaultClasses result:", result);
        await saveFilterData(filterctl);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleGetPassword(message) {
    try {
        const account = await accounts.get(message.accountId);
        const filterctl = await getFilterDataController();
        return await filterctl.getPassword(account);
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
            account = await accounts.selected();
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

/*
async function handleGetDomains() {
    try {
        return await accounts.domains();
    } catch (e) {
        console.error(e);
    }
}

async function handleGetEnabledDomains() {
    try {
        return await accounts.enabledDomains();
    } catch (e) {
        console.error(e);
    }
}

async function handleSetDomains(message) {
    try {
        return await accounts.setDomains(message.domains);
    } catch (e) {
        console.error(e);
    }
}

async function handleSetDomainEnabled(message) {
    try {
        return await accounts.setDomainEnabled(message.domain, message.enabled);
    } catch (e) {
        console.error(e);
    }
}
*/

///////////////////////////////////////////////////////////////////////////////
//
//  DOM and API event handlers
//
///////////////////////////////////////////////////////////////////////////////

async function onWindowCreated(info) {
    try {
        if (verbose) {
            console.debug("onWindowCreated:", info);
        }
    } catch (e) {
        console.error(e);
    }
}

async function onTabCreated(tab) {
    try {
        if (verbose) {
            console.debug("onTabCreated:", tab);
        }
    } catch (e) {
        console.error(e);
    }
}

async function onTabActivated(tab) {
    try {
        if (verbose) {
            console.debug("onTabActivated:", tab);
        }
    } catch (e) {
        console.error(e);
    }
}

//var uriMenuId = null;
//var passwdMenuId = null;

async function onTabUpdated(tabId, changeInfo, tab) {
    try {
        if (verbose) {
            console.debug("onTabUpdated:", { tabId: tabId, changeInfo: changeInfo, tab: tab });
        }
        if (tab.status === "complete" && tab.type === "addressBook") {
            if (verbose) {
                console.log("address book tab opened");
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function onTabRemoved(tabId, removeInfo) {
    try {
        if (verbose) {
            console.debug("onTabRemoved:", { tabId: tabId, removeInfo: removeInfo });
        }
    } catch (e) {
        console.error(e);
    }
}

async function getConnectedFilterBooks() {
    try {
        if (verbose) {
            console.log("getConnectedFilterBooks");
        }
        const books = await messenger.cardDAV.getBooks();
        if (verbose) {
            console.log("connected cardDAV books:", books);
        }
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

// API event handlers
messenger.runtime.onStartup.addListener(onStartup);
messenger.runtime.onInstalled.addListener(onInstalled);
messenger.runtime.onSuspend.addListener(onSuspend);
messenger.runtime.onSuspendCanceled.addListener(onSuspendCanceled);

messenger.windows.onCreated.addListener(onWindowCreated);

messenger.tabs.onCreated.addListener(onTabCreated);
messenger.tabs.onActivated.addListener(onTabActivated);
messenger.tabs.onUpdated.addListener(onTabUpdated);
messenger.tabs.onRemoved.addListener(onTabRemoved);

messenger.menus.onClicked.addListener(onMenuClick);
messenger.menus.onShown.addListener(onMenuShown);

messenger.runtime.onConnect.addListener(onConnect);
messenger.runtime.onMessage.addListener(onMessage);

console.log("background page loaded");
