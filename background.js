import { Accounts } from "./accounts.js";
import * as ports from "./ports.js";
import { accountEmailAddress, displayMessage, generateUUID } from "./common.js";
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
let accounts = undefined;
let filterctl = undefined;

let pendingConnections = new Map();
const backgroundId = "background-" + generateUUID();

let displayedMessagesAccount = undefined;
let displayedMessagesTab = undefined;

let menus = {};

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
        accounts = new Accounts();
        let enabled = await accounts.enabled();
        for (const account of Object.values(enabled)) {
            await accounts.select(account);
            break;
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

// flags: onPort: true will use the connected port
async function postEditorMessage(message, flags = {}) {
    try {
        var port = await ports.get("editor", ports.NO_WAIT);
        if (port === undefined) {
            if (flags.requireSuccess === false) {
                return false;
            }
            throw new Error("editor not connected");
        } else {
            if (typeof message === "string") {
                message = { id: message };
            }
            message.src = backgroundId;
            await port.postMessage(message);
        }
        return true;
    } catch (e) {
        console.error(e);
    }
}

async function onSuspend() {
    try {
        console.warn("background suspending");
        await postEditorMessage("backgroundSuspending", { requireSuccess: false });
        //await messenger.runtime.sendMessage({ id: "backgroundSuspending", src: backgroundId });
    } catch (e) {
        console.error(e);
    }
}

async function onSuspendCanceled() {
    try {
        console.warn("background suspend canceled");
        await postEditorMessage("backgroundSuspendCanceled", { requireSuccess: false });
        //await messenger.runtime.sendMessage({ id: "backgroundSuspenCanceled", src: backgroundId });
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
                await messenger.runtime.sendMessage({ id: "backgroundActivated", src: backgroundId });
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

async function addSenderCommand(index, command, tab) {
    try {
        if (verbose) {
            console.debug("addSenderCommand:", index, tab);
        }

        if (displayedMessagesAccount === undefined) {
            console.warn("onCommand:", command, { displayedMessagesAccount });
            return;
        }
        if (displayedMessagesTab === undefined) {
            console.warn("onCommand:", command, { displayedMessagesTab });
            return;
        }
        let book;
        if (index === "default") {
            book = await getAddSenderTarget(displayedMessagesAccount);
        } else {
            const books = await filterctl.getCardDAVBooks(displayedMessagesAccount);
            const indexed = books[parseInt(index) - 1];
            if (indexed !== undefined) {
                book = indexed.name;
            }
        }
        if (book !== undefined) {
            await addSenderToFilterBook(displayedMessagesAccount, displayedMessagesTab, book);
        }
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
        let prefix = "mailfilter-add-sender-";
        if (command.substr(0, prefix.length) === prefix) {
            let suffix = command.substr(prefix.length);
            return await addSenderCommand(suffix, command, tab);
        }
        switch (command) {
            case "mailfilter-control-panel":
                return await focusEditorWindow();
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
        if (verbose) {
            console.debug("background.onMessage:", message, sender);
            console.log("background.OnMessage received:", message.id, message.src);
        }

        let response = undefined;

        // process messages not requiring connection
        switch (message.id) {
            case "focusEditorWindow":
                await focusEditorWindow();
                return;

            case "optInApproved":
                await initialize("optInApproved");
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
                if (accounts !== undefined) {
                    response = await accounts.enabled();
                }
                break;
            case "getSelectedAccount":
                if (accounts !== undefined) {
                    response = await accounts.selected();
                }
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
        if (verbose) {
            console.log("background.onMessage returning:", response);
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
//  menu configuration
//
///////////////////////////////////////////////////////////////////////////////

let menuConfig = {
    rmfControlPanel: {
        properties: {
            title: "Mail Filter Control Panel",
            contexts: ["tools_menu"],
        },
        onClicked: onMenuControlPanelClicked,
    },

    rmfSelectBook: {
        properties: {
            title: "Set Filter Book Target",
            contexts: ["folder_pane", "message_list"],
        },
        onCreated: onMenuCreatedAddBooks,
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
            title: "Add Sender to '__book__'",
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
        menus = {};
        for (let [mid, config] of Object.entries(menuConfig)) {
            if (config.noInit !== true) {
                await createMenu(mid, config);
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
        let enabled = false;
        if (account !== undefined) {
            enabled = await accounts.isEnabled(account, { throwError: false });
        }
        if (enabled) {
            if (book === undefined) {
                book = await getAddSenderTarget(account);
            }
            await messenger.messageDisplayAction.setTitle({ title: "Add to '" + book + "'" });
            await messenger.messageDisplayAction.enable();
            displayedMessagesAccount = account;
        } else {
            await messenger.messageDisplayAction.setTitle({ title: "Add Sender Disabled" });
            await messenger.messageDisplayAction.disable();
            displayedMessagesAccount = undefined;
        }
    } catch (e) {
        console.error(e);
    }
}

async function createMenu(mid, config) {
    try {
        if (verbose) {
            console.debug("createMenu:", mid, config);
        }

        if (Object.hasOwn(menus, mid)) {
            console.error("menu exists:", mid, config, menus);
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
            if (!Object.hasOwn(menus, created.pid)) {
                console.error("nonexistent parent:", { config, properties, menus });
                throw new Error("nonexistent parent");
            }
            menus[created.pid].subs.push(created);
        }
        menus[mid] = created;
        if (verbose) {
            console.log("createMenu:", mid, {
                created,
                config,
                properties,
                menus,
            });
        }
        if (Object.hasOwn(created, "onCreated")) {
            await created.onCreated(created);
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
        if (!Object.hasOwn(info, "menuItemId")) {
            console.error("missing menuItemId:", info, tab);
            throw new Error("missing menuItemId");
        }
        if (Object.hasOwn(info, "menuIds")) {
            console.error("unexpected menuIds:", info, tab);
            throw new Error("unexpected menuIds");
        }
        await onMenuEvent("onClicked", [info.menuItemId], info, tab);
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
        if (!Object.hasOwn(info, "menuIds")) {
            console.error("missing menuIds:", info, tab);
            throw new Error("missing menuIds");
        }
        if (Object.hasOwn(info, "menuItemId")) {
            console.error("unexpected menuItemId:", info, tab);
            throw new Error("unexpected menuItemId");
        }
        await onMenuEvent("onShown", info.menuIds, info, tab);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuEvent(menuEvent, mids, info, tab) {
    try {
        console.assert(Array.isArray(mids));
        let refresh = false;
        let detail = await menuEventDetail(info, tab);
        if (menuEvent === "onShown" && detail.setVisibility) {
            await setMenuVisibility(detail.account, detail.context);
            refresh = true;
        }
        for (let mid of mids) {
            if (Object.hasOwn(menus, mid)) {
                if (Object.hasOwn(menus[mid], menuEvent)) {
                    let handler = menus[mid][menuEvent];
                    let changed = await handler(menus[mid], detail);
                    refresh ||= changed;
                }
            } else {
                console.error("menu not found:", menuEvent, mid, { detail, menus });
                throw new Error("menu not found");
            }
        }
        if (refresh) {
            await messenger.menus.refresh();
        }
    } catch (e) {
        console.error(e);
    }
}

async function setMenuVisibility(account, context) {
    try {
        if (verbose) {
            console.debug("setMenuVisibility:", account, context);
        }

        let book = account === undefined ? undefined : await getAddSenderTarget(account);
        for (const config of Object.values(menus)) {
            if (config.properties.contexts.includes(context)) {
                let properties = {};
                properties.visible = account !== undefined;
                if (properties.visible && config.account !== undefined) {
                    properties.visible = account.id === config.account.id;
                    if (config.properties.type === "radio") {
                        properties.checked = config.properties.title === book;
                    }
                }
                if (verbose) {
                    console.debug("updating menu:", config.id, properties);
                }
                await messenger.menus.update(config.id, properties);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// return info about the account for onMenuShown handlers
async function menuEventDetail(info, tab) {
    try {
        if (verbose) {
            console.debug("menuEventDetail:", info, tab);
        }
        let ret = {
            info,
            tab,
            setVisibility: false,
        };

        if (Array.isArray(info.selectedFolders)) {
            console.assert(!Object.hasOwn(info, "displayedFolder"), "conflicting info folders");
            for (const folder of info.selectedFolders) {
                ret.account = await accounts.get(folder.accountId, { throwError: false });
                break;
            }
        } else if (Object.hasOwn(info, "displayedFolder")) {
            console.assert(!Object.hasOwn(info, "selectedFolders"), "conflicting info folders");
            ret.account = await accounts.get(info.displayedFolder.accountId, { throwError: false });
        }

        if (Object.hasOwn(info, "contexts")) {
            console.assert(Array.isArray(info.contexts));
            if (info.contexts.includes("folder_pane")) {
                console.assert(!info.contexts.includes("message_list"), "conflicting info context");
                ret.context = "folder_pane";
                ret.setVisibility = true;
            } else if (info.contexts.includes("message_list")) {
                console.assert(!info.contexts.includes("folder_pane"), "conflicting info context");
                ret.context = "message_list";
                ret.setVisibility = true;
            }
        }
        if (verbose) {
            console.debug("menuEventDetail returning:", ret);
        }
        return ret;
    } catch (e) {
        console.error(e);
    }
}

// add filterbook submenus
async function onMenuCreatedAddBooks(created) {
    try {
        if (verbose) {
            console.debug("onMenuCreatedAddBooks:", created);
        }

        let enabled = await accounts.enabled();
        for (const account of Object.values(enabled)) {
            let email = accountEmailAddress(account);
            const books = await filterctl.getCardDAVBooks(account);
            for (const book of books) {
                let config = Object.assign({}, menuConfig.rmfBook);
                config.properties = Object.assign({}, menuConfig.rmfBook.properties);
                let id = `rmfBook-${email}-${book.name}`;
                config.account = account;
                config.book = book.name;
                config.properties.title = book.name;
                config.properties.parentId = created.id;
                await createMenu(id, config);
            }
        }
        return true;
    } catch (e) {
        console.error(e);
    }
}

// change text to show selected filter book name or hide if inactive account
async function onMenuShownUpdateAddSenderTitle(target, detail) {
    try {
        if (verbose) {
            console.debug("onMenuShownUpdateAddSenderTitle:", { target, detail });
        }
        if (detail.account === undefined) {
            await messenger.menus.update(target.id, { visible: false });
        } else {
            let book = await getAddSenderTarget(detail.account);
            console.assert(target.properties.title === "Add Sender to '__book__'");
            let title = target.properties.title.replace(/__book__/, book);
            await messenger.menus.update(target.id, { title });
        }
        return true;
    } catch (e) {
        console.error(e);
    }
}

async function onActionButtonClicked(tab, info) {
    try {
        if (verbose) {
            console.debug("onActionButtonClicked:", { tab, info });
        }
        await focusEditorWindow();
    } catch (e) {
        console.error(e);
    }
}

// update checkmark on selected filter book
async function onMenuClickedSelectBook(target, detail) {
    try {
        if (verbose) {
            console.log("onMenuClickedSelectBook:", target.id, { target, detail, displayedMessagesAccount });
        }
        let account = target.account;
        let book = target.book;
        await setAddSenderTarget(account, book);
    } catch (e) {
        console.error(e);
    }
}

async function onMenuControlPanelClicked(target, detail) {
    try {
        if (verbose) {
            console.debug("onMenuControlPanel clicked:", target.id, { target, detail });
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
        if (account === undefined) {
            throw new Error("undefined account");
        }
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
            await postEditorMessage(
                {
                    id: "AddSenderTargetChanged",
                    account: account,
                    bookName: bookName,
                },
                { requireSuccess: false },
            );
            if (displayedMessagesAccount !== undefined && displayedMessagesAccount.id === account.id) {
                await updateMessageDisplayAction(account, bookName);
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

async function onMenuAddSenderClicked(target, detail) {
    try {
        if (verbose) {
            console.debug("onMenuAddSenderToFilterBook:", target.id, { target, detail });
        }
        const book = await getAddSenderTarget(detail.account);
        await addSenderToFilterBook(detail.account, detail.tab, book);
    } catch (e) {
        console.error(e);
    }
}

// perform 'addSender' function on selected messages in tab with specified target book
async function addSenderToFilterBook(account, tab, book) {
    try {
        if (verbose) {
            console.debug("addSenderToFilterBook:", account, tab, book);
        }
        const messageList = await messenger.messageDisplay.getDisplayedMessages(tab.id);
        if (verbose) {
            console.debug("messageList:", messageList);
        }
        let sendersAdded = [];
        for (const message of messageList.messages) {
            const account = await accounts.get(message.folder.accountId);
            console.assert(account.id === account.id);
            const fullMessage = await messenger.messages.getFull(message.id);
            const headers = fullMessage.headers;
            if (verbose) {
                console.debug({ account: account, book: book, author: message.author, message: message, headers: headers });
            }
            var sender = String(message.author)
                .replace(/^[^<]*</g, "")
                .replace(/>.*$/g, "");
            if (!sendersAdded.includes(sender)) {
                await displayMessage(`Adding '${sender}' to '${book}'...`);
                console.log("AddSender request:", sender, book, account);
                filterctl
                    .addSenderToFilterBook(account, sender, book)
                    .then((response) => {
                        displayMessage(`Added '${sender}' to '${book}'`).then(() => {
                            console.log("AddSender completed:", sender, book, account, response);
                        });
                    })
                    .catch((e) => {
                        console.error("AddSender failed:", sender, book, account, e);
                    });
                sendersAdded.push(sender);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMessageDisplayActionClicked(tab, info) {
    try {
        if (verbose) {
            console.debug("message display action clicked, relaying to menu clicked handler", tab, info);
        }
        console.assert(displayedMessagesAccount !== undefined);
        console.assert(displayedMessagesTab.id === tab.id);
        let book = await getAddSenderTarget(displayedMessagesAccount);
        await addSenderToFilterBook(displayedMessagesAccount, tab, book);
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
        let enabled = await accounts.enabled();
        filterctl = new FilterDataController(enabled, email);
        await filterctl.readState();
        let selectedAccount = await accounts.selected();
        if (selectedAccount !== undefined) {
            await handleGetPassword({ accountId: selectedAccount.id });
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
        if (verbose) {
            console.debug("handleSetClasses:", message);
        }
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
        if (verbose) {
            console.debug("sendClasses result:", result);
        }
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
        if (verbose) {
            console.debug("sendAllClasses result:", result);
        }
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
        const password = await filterctl.getPassword(account);
        return password;
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

/*
async function onWindowCreated(info) {
    try {
        if (verbose) {
            console.log("onWindowCreated:", info);
        }
    } catch (e) {
        console.error(e);
    }
}
*/

/*
async function onTabCreated(tab) {
    try {
        if (verbose) {
            console.log("onTabCreated:", tab);
        }
    } catch (e) {
        console.error(e);
    }
}
*/

/*
async function onTabActivated(tab) {
    try {
        if (verbose) {
            console.log("onTabActivated:", tab);
        }
    } catch (e) {
        console.error(e);
    }
}
*/

/*
async function onTabUpdated(tabId, changeInfo, tab) {
    try {
        if (verbose) {
            console.log("onTabUpdated:", tab.type, tab.status, tab.url, changeInfo.status, { changeInfo, tab });
        }
    } catch (e) {
        console.error(e);
    }
}
*/

/*
async function onTabRemoved(tabId, removeInfo) {
    try {
        if (verbose) {
            console.log("onTabRemoved:", { tabId: tabId, removeInfo: removeInfo });
        }
    } catch (e) {
        console.error(e);
    }
}
*/

async function onMessagesDisplayed(tab, displayedMessages) {
    try {
        if (verbose) {
            console.log("onMessagesDisplayed:", tab, displayedMessages);
        }
        displayedMessagesTab = undefined;
        for (const message of displayedMessages.messages) {
            if (accounts === undefined) {
                await messenger.menus.removeAll();
            } else {
                let account = await accounts.get(message.folder.accountId);
                displayedMessagesTab = tab;
                await updateMessageDisplayAction(account);
            }
            break;
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

//messenger.windows.onCreated.addListener(onWindowCreated);

//messenger.tabs.onCreated.addListener(onTabCreated);
//messenger.tabs.onActivated.addListener(onTabActivated);
//messenger.tabs.onUpdated.addListener(onTabUpdated);
//messenger.tabs.onRemoved.addListener(onTabRemoved);

messenger.messageDisplay.onMessagesDisplayed.addListener(onMessagesDisplayed);

messenger.runtime.onConnect.addListener(onConnect);
messenger.runtime.onMessage.addListener(onMessage);

messenger.commands.onCommand.addListener(onCommand);

messenger.messageDisplayAction.onClicked.addListener(onMessageDisplayActionClicked);
messenger.action.onClicked.addListener(onActionButtonClicked);

console.warn("background page loaded");

//initialize("page_loaded").then(() => {
//    console.warn("initialized from page load");
//});
