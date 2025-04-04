import { Accounts } from "./accounts.js";
import * as ports from "./ports.js";
import { accountEmailAddress, generateUUID } from "./common.js";
import { FilterDataController } from "./filterctl.js";
import { email } from "./email.js";
import { config } from "./config.js";
import { verbosity } from "./common.js";

/* globals messenger, console */

// FIXME: test when no imap accounts are present
// FIXME  test when no domains are selected

// control flags
const verbose = verbosity.background;

// state vars
let accounts = null;
let filterctl = null;

let pendingConnections = new Map();
const backgroundId = "background-" + generateUUID();

let menu = {};

///////////////////////////////////////////////////////////////////////////////
//
//  startup and suspend state management
//
///////////////////////////////////////////////////////////////////////////////

async function initialize(mode) {
    try {
        if (await config.local.getBool(config.key.autoClearConsole)) {
            console.clear();
        }
        const approved = await isApproved();

        const manifest = await messenger.runtime.getManifest();
        console.log(manifest.name + " v" + manifest.version + " (" + mode + ") OptIn:" + String(approved));

        if (verbose) {
            console.debug("configuration:", await config.local.getAll());
            console.debug("commands:", await messenger.commands.getAll());
        }

        if (!approved) {
            await messenger.messageDisplayAction.disable();
            return;
        }

        await initAccounts();
        await initFilterDataController();
        await initMenus();

        let autoOpen = await config.local.getBool(config.key.autoOpen);
        if (await config.local.getBool(config.key.reloadAutoOpen)) {
            autoOpen = true;
        }
        await config.local.remove(config.key.reloadAutoOpen);
        if (autoOpen) {
            await focusEditorWindow();
        }
    } catch (e) {
        console.error(e);
    }
}

async function initAccounts() {
    try {
        if (accounts === null) {
            accounts = new Accounts();
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
        console.warn("background suspending");
        await messenger.runtime.sendMessage(undefined, { id: "backgroundSuspending", src: backgroundId });
    } catch (e) {
        console.error(e);
    }
}

async function onSuspendCanceled() {
    try {
        console.warn("background suspend canceled");
        await messenger.runtime.sendMessage(undefined, { id: "backgroundSuspendCanceled", src: backgroundId });
        //await initialize("SuspendCanceled");
    } catch (e) {
        console.error(e);
    }
}

async function findEditorTab() {
    try {
        const editorTitle = await config.local.get(config.key.editorTitle);
        const tabs = await messenger.tabs.query({ type: "content", title: editorTitle });
        for (const tab of tabs) {
            if (tab.title === editorTitle) {
                return tab;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
    }
}

/*
async function isEditorConnected() {
    try {
        var port = await ports.get("editor", ports.NO_WAIT);
        if (verbose) {
            console.debug("isEditorConnected: port:", port);
        }
        return port ? true : false;
    } catch (e) {
        console.error(e);
    }
}
*/

async function focusEditorWindow() {
    try {
        if (verbose) {
            console.debug("focusEditorWindow");
        }

        // divert to options page if not approved
        if (!(await checkApproved())) {
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
                    console.debug("sending activated notification");
                }
                await messenger.runtime.sendMessage(undefined, { id: "backgroundActivated", src: backgroundId });
                if (verbose) {
                    console.debug("activated notificaton sent");
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
            console.error("onConnect: pending connection exists:", port.name);
        }
        pendingConnections.set(port.name, port);
        if (verbose) {
            console.log("background received connection request:", port.name);
        }
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

async function onCommand(command, tab) {
    try {
        if (verbose) {
            console.debug("onCommand:", command, tab);
        }
        if (!(await checkApproved())) {
            return;
        }
        switch (command) {
            case "mailfilter-control-panel":
                await focusEditorWindow();
                break;
            default:
                console.error("unknown command:", command);
                throw new Error("unknown command");
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMessage(message, sender) {
    try {
        console.debug("background.onMessage:", message, sender);
        console.log("background.OnMessage received:", message.id, message.src);

        let response = undefined;

        // process messages not requiring connection
        switch (message.id) {
            case "focusEditorWindow":
                await focusEditorWindow();
                return;
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
                response = await accounts.enabled();
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
            case "getClasses":
                response = await handleGetClasses(message);
                break;
            case "setClasses":
                response = await handleSetClasses(message);
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
            case "getBooks":
                response = await handleGetBooks(message);
                break;
            case "setBooks":
                response = await handleSetBooks(message);
                break;
            case "sendBooks":
                response = await handleSendBooks(message);
                break;
            case "sendAllBooks":
                response = await handleSendAllBooks(message);
                break;
            case "refreshBooks":
                response = await handleRefreshBooks();
                break;
            case "refreshAllBooks":
                response = await handleRefreshAllBooks();
                break;
            case "setDefaultBooks":
                response = await handleSetDefaultBooks();
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
            case "setAddSenderTarget":
                response = await setAddSenderTarget(await messageAccount(message), message.bookName);
                break;
            case "getAddSenderTarget":
                response = await getAddSenderTarget(await messageAccount(message));
                break;
            case "findEditorTab":
                response = await findEditorTab();
                break;
            case "initMenus":
                response = await initMenus();
                break;
            case "cacheControl":
                response = await handleCacheControl(message);
                break;
            case "getCardDAVBooks":
                response = await handleGetCardDAVBooks(message);
                break;
            default:
                console.error("background: received unexpected message:", message, sender);
                break;
        }
        if (response !== undefined) {
            if (typeof response !== "object") {
                response = { result: response };
            }
        }
        console.log("background.onMessage returning:", response);
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
//  menu configuration
//
///////////////////////////////////////////////////////////////////////////////

let menuConfig = {
    /*
    rmfMailFilterDivider: {
        properties: {
            title: "Mail Filter",
            type: "separator",
            contexts: ["tools_menu", "folder_pane", "message_list"],
        },
    },
    */

    rmfControlPanel: {
        properties: {
            title: "Control Panel",
            contexts: ["tools_menu"],
        },
        onClicked: onMenuControlPanelClicked,
    },

    rmfSelectBook: {
        properties: {
            title: "Select Filter Book",
            contexts: ["folder_pane", "message_list"],
        },
        onCreated: onMenuCreatedAddBooks,
        onShown: onMenuShownUpdateBooks,
        subId: "rmfBook",
    },

    rmfBook: {
        account: "__account-id__",
        book: "__book__",
        properties: {
            title: "__book__",
            contexts: ["folder_pane", "message_list"],
            parentId: "rmfSelectBook",
            type: "radio",
        },
        onClicked: onMenuClickedSelectBook,
        noInit: true,
    },

    rmfAddSenderToFilterBook: {
        properties: {
            title: "Add Sender To Filter Book '__book__'",
            contexts: ["message_list"],
        },
        onClicked: onMenuAddSenderClicked,
        onShown: onMenuShownUpdateAddSenderTitle,
    },
};

// reset menu configuration from menu config data structure
async function initMenus() {
    try {
        await messenger.menus.removeAll();
        menu = {};
        for (let [mid, config] of Object.entries(menuConfig)) {
            if (config.noInit !== true) {
                createMenu(mid, config);
                if (Object.hasOwn(config, "onCreate")) {
                    config.onCreate(mid, menu[mid]);
                }
            }
        }
        await updateMessageDisplayAction();
        await messenger.menus.refresh();
    } catch (e) {
        console.error(e);
    }
}

async function updateMessageDisplayAction(account = undefined, book = undefined) {
    try {
        //FIXME: determine if the account matches the displayed account
        if (account === undefined || book === undefined) {
            account = await accounts.selected();
            book = await getAddSenderTarget(account);
        }
        await messenger.messageDisplayAction.setTitle({ title: "Add Sender to '" + book + "'" });
        await messenger.messageDisplayAction.enable();
    } catch (e) {
        console.error(e);
    }
}

async function createMenu(mid, config) {
    try {
        if (verbose) {
            console.debug("createMenu:", mid, config);
        }

        if (Object.hasOwn(menu, mid)) {
            console.error("menu exists:", mid, config, menu);
            throw new Error("menu exists");
        }
        let properties = Object.assign({}, config.properties);
        properties.id = mid;
        let cid = await messenger.menus.create(properties);
        console.assert(cid === mid);
        let created = Object.assign({}, config);
        created.properties = Object.assign({}, config.properties);
        created.id = mid;
        created.subs = [];
        if (Object.hasOwn(created.properties, "parentId")) {
            created.pid = created.properties.parentId;
            if (!Object.hasOwn(menu, created.pid)) {
                console.error("nonexistent parent:", { config, properties, menu });
                throw new Error("nonexistent parent");
            }
            menu[created.pid].subs.push(created);
        }
        menu[mid] = created;
        if (verbose) {
            console.log("createMenu:", {
                created,
                config,
                properties,
                menu,
            });
        }
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  menu handler helpers
//
///////////////////////////////////////////////////////////////////////////////

async function isApproved() {
    try {
        return await config.local.getBool(config.key.optInApproved);
    } catch (e) {
        console.error(e);
    }
}

// if opt-in not approved, divert to extension options panel and return false
async function checkApproved() {
    try {
        let approved = await isApproved();
        if (!approved) {
            await messenger.runtime.openOptionsPage();
        }
        return approved;
    } catch (e) {
        console.error(e);
    }
}

/*
// determine account id from menu click context info
async function menuContextAccountId(info) {
    try {
        let accountId = undefined;
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
        // if account is known from menu context, select it
        if (accountId != null) {
            let account = await accounts.get(accountId);
            if (account) {
                if (verbose) {
                    console.debug("menuContextAccountId: setting selected account:", account);
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
*/

///////////////////////////////////////////////////////////////////////////////
//
//  menu event handlers
//
///////////////////////////////////////////////////////////////////////////////

async function onMenuClicked(info, tab) {
    try {
        if (verbose) {
            console.debug("onMenuClicked:", { info, tab });
        }
        if (!(await isApproved())) {
            return;
        }
        await onMenuEvent("onClicked", info, tab);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuShown(info, tab) {
    try {
        if (verbose) {
            console.debug("onMenuShown:", { info, tab });
        }
        if (!(await isApproved())) {
            return;
        }
        await onMenuEvent("onShown", info, tab);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuEvent(menuEvent, info, tab) {
    try {
        console.assert(info.menuIds.length !== 0, "no menuIds");

        let refresh = false;
        for (let mid of info.menuIds) {
            if (Object.hasOwn(menu, mid)) {
                let visible = true;
                let detail = await menuEventDetail(menu[mid], info, tab);
                if (info.contexts.some((c) => c === "folder_pane" || c === "message_list")) {
                    visible = detail.enabled;
                    await messenger.menus.update(mid, { visible });
                }
                if (visible && Object.hasOwn(menu[mid], menuEvent)) {
                    refresh ||= await menu[mid][menuEvent](detail, info, tab);
                }
            }
        }
        if (refresh) {
            await messenger.menus.refresh();
        }
    } catch (e) {
        console.error(e);
    }
}

// return info about the account for onMenuShown handlers
async function menuEventDetail(config, info, tabs) {
    try {
        if (verbose) {
            console.debug("menuEventDetail:", config, info, tabs);
        }
        let ret = {
            menu: config,
        };
        if (Object.hasOwn(config, "account")) {
            ret.account = config.account;
        } else {
            // if there is no account in the menu, scan info for the account
            let accountId;
            console.assert(accountId === undefined);
            for (const context of info.contexts) {
                if (context === "folder_pane") {
                    console.assert(ret.context === undefined);
                    ret.context = context;
                    console.assert(accountId === undefined);
                    accountId = info.selectedFolders[0].accountId;
                    break;
                } else if (context === "message_list") {
                    console.assert(ret.context === undefined);
                    ret.context = context;
                    console.assert(accountId === undefined);
                    accountId = info.displayedFolder.accountId;
                    break;
                }
            }
            if (accountId !== undefined) {
                ret.account = await accounts.get(accountId, false);
            }
        }
        ret.enabled = Object.hasOwn(ret, "account");
        if (verbose) {
            console.debug("menuEventDetail returning:", ret);
        }
        return ret;
    } catch (e) {
        console.error(e);
    }
}

// add filterbook submenus
async function onMenuCreatedAddBooks(target, info, tab) {
    try {
        if (verbose) {
            console.log("onMenuCreatedAddBooks:", { target, info, tab });
        }

        for (const account of await accounts.enabled()) {
            let email = accountEmailAddress(account);
            for (const book of await filterctl.getCardDAVBooks(account)) {
                let config = Object.Assign({}, menuConfig.rmfBook);
                config.properties = Object.Assign({}, menuConfig.rmfBook.properties);
                let id = `rmfBook-${email}-${book}`;
                config.account = account;
                config.book = book;
                config.properties.Title = book;
                config.properties.parentId = target.menu.id;
                await createMenu(id, config);
            }
        }
        await onMenuShownUpdateBooks(target, info, tab);
        return true;
    } catch (e) {
        console.error(e);
    }
}

// set visibility and checked state of book menus
async function onMenuShownUpdateBooks(target, info, tab) {
    try {
        if (verbose) {
            console.log("onMenuSelectedFilterBookShown:", target, info, tab);
        }
        let book = await getAddSenderTarget(target.account);
        for (const sub of target.menu.subs) {
            let visible = sub.account.id === target.account.id;
            let checked = visible && sub.book === book;
            await messenger.menus.update(sub.id, { visible, checked });
        }
    } catch (e) {
        console.error(e);
    }
}

// change text to show selected filter book name or hide if inactive account
async function onMenuShownUpdateAddSenderTitle(target, info, tab) {
    try {
        if (verbose) {
            console.log("onMenuShownUpdateAddSenderTitle:", { target, info, tab });
        }
        let book = await getAddSenderTarget(target.account);
        console.assert(target.menu.properties.title === "Add Sender To Filter Book '__book__'");
        let title = target.menu.properties.title.replace(/__book__/, book);
        await messenger.menus.update(target.menu.id, { title });
    } catch (e) {
        console.error(e);
    }
}

async function onActionButtonClicked(tab, info) {
    try {
        if (verbose) {
            console.log("onActionButtonClicked:", { tab, info });
        }
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

// update checkmark on selected filter book
async function onMenuClickedSelectBook(config, detail, info, tab) {
    try {
        if (verbose) {
            console.log("onMenuClickedSelectBook:", { config, detail, info, tab });
        }
        let account = config.account;
        let book = config.book;
        await setAddSenderTarget(account, book);
        await updateMessageDisplayAction(account, book);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuControlPanelClicked(config, detail, info, tab) {
    try {
        if (verbose) {
            console.log("onMenuControlPanel clicked:", { config, detail, info, tab });
        }
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

//////////////////////////////////////////////////////
//
// selected 'add sender' book management
//
//////////////////////////////////////////////////////

// read add sender target book name from config
async function getAddSenderTarget(account) {
    try {
        let bookName = undefined;
        let targets = await config.local.get(config.key.addSenderTarget);
        if (targets !== undefined) {
            bookName = targets[account.id];
        }
        if (bookName === undefined) {
            let books = await filterctl.getCardDAVBooks(account);
            for (const book of books) {
                bookName = book.name;
                await setAddSenderTarget(account, bookName);
                break;
            }
        }
        return bookName;
    } catch (e) {
        console.error(e);
    }
}

// write add sender target book name to config
async function setAddSenderTarget(account, bookName) {
    try {
        let targets = await config.local.get(config.key.addSenderTarget);
        if (targets === undefined) {
            targets = {};
        }
        if (bookName !== targets[account.id]) {
            targets[account.id] = bookName;
            await config.local.set(config.key.addSenderTarget, targets);
            if (verbose) {
                console.debug("changed addSenderTarget:", account.id, bookName, targets);
            }
            var port = await ports.get("editor", ports.NO_WAIT);
            if (port !== undefined) {
                await messenger.runtime.sendMessage(undefined, {
                    id: "AddSenderTargetChanged",
                    account: account,
                    bookName: bookName,
                    src: backgroundId,
                    dst: "*",
                });
            }
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

async function onMenuAddSenderClicked(menuId, info, tab) {
    try {
        if (verbose) {
            console.debug("onMenuAddSenderToFilterBook:", menuId, info, tab);
        }
        const messageList = await messenger.messageDisplay.getDisplayedMessages(tab.id);
        if (verbose) {
            console.debug("messageList:", messageList);
        }
        for (const message of messageList.messages) {
            const account = await accounts.get(message.folder.accountId);
            const book = await getAddSenderTarget(account);
            const fullMessage = await messenger.messages.getFull(message.id);
            const headers = fullMessage.headers;
            if (verbose) {
                console.debug({ account: account, book: book, author: message.author, message: message, headers: headers });
            }
            var sender = String(message.author)
                .replace(/^[^<]*</g, "")
                .replace(/>.*$/g, "");
            const response = await filterctl.addSenderToFilterBook(account, sender, book);
            //const command = "mkaddr " + book + " " + sender;
            // const response = await email.sendRequest(account, command);
            if (verbose) {
                console.debug("filterctl.addSenderToFilterBook response:", response);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMessageDisplayActionClicked(tab, info) {
    try {
        if (verbose) {
            console.log("message display action clicked, relaying to menu clicked handler");
        }
        await onMenuAddSenderClicked("message_display_action", info, tab);
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  Filter Data Controller
//
///////////////////////////////////////////////////////////////////////////////

async function initFilterDataController() {
    try {
        if (filterctl === null) {
            let enabledAccounts = await accounts.enabled();
            filterctl = new FilterDataController(enabledAccounts, email);
            await filterctl.readState();
            let selectedAccount = await accounts.selected();
            await filterctl.getPassword(selectedAccount);
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleCacheControl(message) {
    try {
        switch (message.command) {
            case "clear":
                await filterctl.resetState();
                return "cleared";
            case "enable":
                await filterctl.setStatePersistence(true);
                return "enabled";
            case "disable":
                await filterctl.setStatePersistence(false);
                return "disabled";
            default:
                throw new Error("unknown cacheControl command: " + message.command);
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleGetCardDAVBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        let books = await filterctl.getCardDAVBooks(account);
        let result = books;
        if (message.names === true) {
            result = [];
            for (const book of books) {
                result.push(book.name);
            }
        }
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleGetBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const force = message.force ? true : false;
        const books = await filterctl.getBooks(account, force);
        return books;
    } catch (e) {
        console.error(e);
    }
}

async function handleSetBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const result = await filterctl.setBooks(account, message.books);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const force = message.force ? true : false;
        let result = await filterctl.sendBooks(account, force);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendAllBooks(message) {
    try {
        const force = message.force ? true : false;
        const result = await filterctl.sendAllBooks(force);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshBooks() {
    try {
        let force = true;
        for (const account of Object.values(accounts.enabled())) {
            await filterctl.getBooks(account, force);
        }
        await filterctl.writeState();
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshAllBooks() {
    try {
        let force = true;
        for (const account of Object.values(accounts.enabled())) {
            await filterctl.getBooks(account, force);
        }
        await filterctl.writeState();
    } catch (e) {
        console.error(e);
    }
}

async function handleSetDefaultBooks(message) {
    try {
        const account = await accounts.get(message.accountId);
        const result = await filterctl.setDefaultBooks(account);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  runtime message handlers
//
///////////////////////////////////////////////////////////////////////////////

async function messageAccount(message) {
    try {
        let accountId = message.accountId;
        if (typeof accountId === "string") {
            let account = await accounts.get(message.accountId);
            if (account !== undefined) {
                return account;
            }
        }
        console.error("invalid accountId in message:", message);
        throw new Error("invalid accountId in message");
    } catch (e) {
        console.error(e);
    }
}

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
        const force = message.force ? true : false;
        const classes = await filterctl.getClasses(account, force);
        return classes;
    } catch (e) {
        console.error(e);
    }
}

async function handleSetClasses(message) {
    try {
        console.debug("handleSetClasses:", message);
        const account = await accounts.get(message.accountId);
        const result = await filterctl.setClasses(account, message.classes);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const force = message.force ? true : false;
        let result = await filterctl.sendClassses(account, force);
        console.debug("sendClasses result:", result);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleSendAllClasses(message) {
    try {
        const force = message.force ? true : false;
        const result = await filterctl.sendAllClasses(force);
        console.debug("sendAllClasses result:", result);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const force = true;
        const result = await filterctl.getClasses(account, force);
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleRefreshAllClasses() {
    try {
        const result = await filterctl.refreshAllClasses();
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleSetDefaultClasses(message) {
    try {
        const account = await accounts.get(message.accountId);
        const result = await filterctl.setClassesDefaults(account);
        await filterctl.writeState();
        return result;
    } catch (e) {
        console.error(e);
    }
}

async function handleGetPassword(message) {
    try {
        const account = await accounts.get(message.accountId);
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
        return await email.sendRequest(account, command, message.body, message.timeout);
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
                console.debug("address book tab opened");
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

///////////////////////////////////////////////////////////////////////////////
//
//  event wiring
//
///////////////////////////////////////////////////////////////////////////////

// API event handlers
messenger.runtime.onInstalled.addListener(onInstalled);
messenger.runtime.onStartup.addListener(onStartup);
messenger.runtime.onSuspend.addListener(onSuspend);
messenger.runtime.onSuspendCanceled.addListener(onSuspendCanceled);

messenger.menus.onClicked.addListener(onMenuClicked);
messenger.menus.onShown.addListener(onMenuShown);

messenger.windows.onCreated.addListener(onWindowCreated);

messenger.tabs.onCreated.addListener(onTabCreated);
messenger.tabs.onActivated.addListener(onTabActivated);
messenger.tabs.onUpdated.addListener(onTabUpdated);
messenger.tabs.onRemoved.addListener(onTabRemoved);

messenger.runtime.onConnect.addListener(onConnect);
messenger.runtime.onMessage.addListener(onMessage);

messenger.commands.onCommand.addListener(onCommand);

messenger.messageDisplayAction.onClicked.addListener(onMessageDisplayActionClicked);
messenger.action.onClicked.addListener(onActionButtonClicked);

console.warn("background page loaded");
