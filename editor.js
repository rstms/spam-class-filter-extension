import * as requests from "./requests.js";
import { initThemeSwitcher } from "./theme_switcher.js";
import { selectedAccountId } from "./common.js";
import { config } from "./config.js";
import { ClassesTab } from "./classes_tab.js";
import { BooksTab } from "./books_tab.js";
import { OptionsTab } from "./options_tab.js";
import { AdvancedTab } from "./advanced_tab.js";
import { HelpTab } from "./help_tab.js";

/* globals messenger, window, document, console */
const verbose = true;

initThemeSwitcher();

var hasLoaded = false;
var backgroundSuspended = false;
var usagePopulated = false;
var activeTab = null;

var accountNames = {};
var accountIndex = {};

var port = null;

var controls = {};

var tab = {
    classes: new ClassesTab(sendMessage, {
        InputKeypress: onClassesInputKeypress,
        NameChanged: onClasessNameChanged,
        SliderMoved: onClassesSliderMoved,
        ScoreChanged: onClassesScoreChanged,
        CellDelete: onClassesCellDelete,
        CellInsert: onClassesCellInsert,
    }),
    books: new BooksTab(sendMessage),
    options: new OptionsTab(sendMessage, { DomainCheckboxChange: onOptionsDomainCheckboxChange }),
    advanced: new AdvancedTab(sendMessage),
    help: new HelpTab(sendMessage),
};

////////////////////////////////////////////////////////////////////////////////
//
//  selected account init
//
////////////////////////////////////////////////////////////////////////////////

async function populateAccountSelect() {
    try {
        if (verbose) {
            console.log("BEGIN populateAccountSelect");
        }

        // disable the select controls while updating
        tab.classes.controls.accountSelect.disabled = true;
        tab.books.controls.accountSelect.disabled = true;

        // clear account select contents
        tab.classes.controls.accountSelect.innerHTML = "";
        tab.books.controls.accountSelect.innerHTML = "";
        tab.advanced.controls.selectedAccount.value = "";

        // get the accounts from the background page
        const accounts = await sendMessage("getAccounts");

        // initialize the select control dropdown lists
        accountNames = {};
        var i = 0;
        for (let id of Object.keys(accounts)) {
            accountNames[id] = accounts[id].name;
            accountNames[i] = accounts[id].name;
            accountIndex[id] = i;
            accountIndex[i] = id;
            addAccountSelectRow(tab.classes.controls.accountSelect, i, id, accounts);
            addAccountSelectRow(tab.books.controls.accountSelect, i, id, accounts);
            i++;
        }

        // get the selected account ID from the background page and update
        const selectedAccountId = await sendMessage("getSelectedAccountId");
        await setSelectedAccount(selectedAccountId);

        tab.classes.accountNames = accountNames;
        tab.books.accountNames = accountNames;

        // enable the select controls
        tab.classes.controls.accountSelect.disabled = false;
        tab.books.controls.accountSelect.disabled = false;

        if (verbose) {
            console.log("END populateAccountSelect");
        }
    } catch (e) {
        console.error(e);
    }
}

function addAccountSelectRow(control, i, id, accounts) {
    try {
        const option = document.createElement("option");
        option.setAttribute("data-account-id", id);
        option.textContent = accounts[id].name;
        control.appendChild(option);
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  selected account control functions
//
////////////////////////////////////////////////////////////////////////////////

async function setSelectedAccount(id) {
    try {
        console.log("setSelectedAccountId:", id, accountNames[id]);
        tab.classes.controls.accountSelect.selectedIndex = accountIndex[id];
        tab.books.controls.accountSelect.selectedIndex = accountIndex[id];
        tab.advanced.controls.selectedAccount.value = accountNames[id];
        tab.advanced.selectedAccountId = id;
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  selected account event handlers
//
////////////////////////////////////////////////////////////////////////////////

async function onAccountSelectChange(sender) {
    try {
        const index = sender.target.selectedIndex;
        if (verbose) {
            console.log("account select index changed:", index, sender.target.id);
        }
        console.assert(
            sender.target === tab.classes.controls.accountSelect || sender.target === tab.books.controls.accountSelect,
            "unexpected event sender:",
            sender,
        );
        const id = selectedAccountId(sender.target);
        if (verbose) {
            console.debug("accountId:", id);
            console.debug("index:", accountIndex[id]);
            console.debug("name:", accountNames[id]);
        }
        tab.classes.controls.accountSelect.selectedIndex = index;
        tab.books.controls.accountSelect.selectedIndex = index;
        tab.advanced.controls.selectedAccount.value = accountNames[id];
        tab.advanced.selectedAccountId = id;
        tab.books.controls.accountSelect.value = accountNames[id];
        const levels = await tab.classes.getClasses(id);
        await tab.classes.populate(levels);
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  tab management
//
////////////////////////////////////////////////////////////////////////////////

function enableTab(name, enabled) {
    try {
        var tab = null;
        var link = null;
        var navlink = null;
        switch (name) {
            case "classes":
                tab = controls.classesTab;
                link = controls.classesTabLink;
                navlink = controls.classesNavLink;
                break;
            case "books":
                tab = controls.booksTab;
                link = controls.booksTabLink;
                navlink = controls.booksNavLink;
                break;
            case "options":
                tab = controls.optionsTab;
                link = controls.optionsTabLink;
                navlink = controls.optionsNavLink;
                break;
            case "advanced":
                tab = controls.advancedTab;
                link = controls.advancedTabLink;
                navlink = controls.advancedNavLink;
                break;
            case "help":
                tab = controls.helpTab;
                link = controls.helpTabLink;
                navlink = controls.helpNavLink;
                break;
            default:
                throw new Error("unknown tab: " + name);
        }
        link.disabled = !enabled;
        if (enabled) {
            delete navlink.classList.remove("disabled");
        } else {
            navlink.classList.add("disabled");
        }
        console.log(enabled ? "enabled tab: " : "disabled tab:", tab.id, link.id, navlink.id);
    } catch (e) {
        console.error(e);
    }
}

async function onTabShow(sender) {
    try {
        if (verbose) {
            console.log("handleTabShow:", sender);
        }
        switch (sender.srcElement) {
            case controls.classesNavLink:
                activeTab = "classes";
                break;
            case controls.booksNavLink:
                activeTab = "books";
                await tab.books.populate();
                break;
            case controls.optionsNavLink:
                activeTab = "options";
                await tab.options.populate();
                break;
            case controls.advancedNavLink:
                activeTab = "advanced";
                await populateUsageControls();
                break;
            case controls.helpNavLink:
                activeTab = "help";
                await populateUsageControls();
                break;
        }
        console.log("active tab:", activeTab);
    } catch (e) {
        console.error(e);
    }
}

async function setAdvancedTabVisible(visible = undefined) {
    try {
        if (visible === undefined) {
            visible = await config.local.get("advancedTabVisible");
        }
        controls.advancedTab.hidden = !visible;
        controls.advancedTabLink.hidden = !visible;
        tab.options.controls.advancedTabVisible.checked = visible;
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  populate advanced / help controls
//
////////////////////////////////////////////////////////////////////////////////

async function populateUsageControls() {
    try {
        if (!usagePopulated) {
            usagePopulated = true;
            const response = await requestUsage();
            if (response) {
                await tab.help.populate(response.Help);
                await tab.advanced.populate(response.Commands);
            } else {
                usagePopulated = false;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function requestUsage() {
    try {
        const message = {
            id: "sendCommand",
            accountId: tab.classes.accountId(),
            command: "usage",
        };

        if (verbose) {
            console.log("requesting usage:", message);
        }
        const response = await sendMessage(message);
        if (verbose) {
            console.log("usageResponse:", response);
        }
        return response;
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  requests RPC handlers and connection management
//
////////////////////////////////////////////////////////////////////////////////

async function handleSelectAccount(message) {
    try {
        console.log("selectAccount:", message);
        if (!tab.classes.controls.accountSelect.disabled) {
            await setSelectedAccount(message.accountId);
            await onAccountSelectChange(message);
        }
        return tab.classes.accountId();
    } catch (e) {
        console.error(e);
    }
}

async function handleSelectEditorTab(message) {
    try {
        switch (message.name) {
            case "classes":
                controls.classesNavLink.click();
                break;
            case "options":
                controls.optionsNavLink.click();
                break;
            case "advanced":
                controls.advancedNavLink.click();
                break;
            case "help":
                controls.helpNavLink.click();
                break;
            default:
                console.warn("selectEditorTab: unexpected tab name:", message.name);
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleMessage(message, sender) {
    try {
        console.log("editor received:", message.id);
        console.debug("editor received message:", message, sender);
        switch (message.id) {
            case "backgroundActivated":
                await connectToBackground();
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

async function handlePortMessage(message, sender) {
    try {
        console.log("editor port received:", message.id);
        console.debug("editor port received message:", message);
        if (await requests.resolveResponses(message)) {
            return;
        }
        if (await requests.resolveRequests(message, sender)) {
            return;
        }
        switch (message.id) {
            case "ping":
                sender.postMessage({ id: "pong", src: "editor" });
                break;
            case "backgroundSuspending":
                backgroundSuspended = true;
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

async function handlePortDisconnect(event) {
    try {
        console.log("background port disconnected:", event);
        console.log("backgroundSuspended:", backgroundSuspended);
        port = null;
    } catch (e) {
        console.error(e);
    }
}

async function sendMessage(message) {
    try {
        if (port === null) {
            await connectToBackground();
        }
        return await requests.sendMessage(port, message);
    } catch (e) {
        console.error(e);
    }
}

async function connectToBackground() {
    try {
        if (port === null) {
            console.log("requesting background page...");
            const background = await messenger.runtime.getBackgroundPage();
            console.log("connecting to background page:", background);
            port = await messenger.runtime.connect({ name: "editor" });
            console.log("connected background port:", port);
            backgroundSuspended = false;
            port.onMessage.addListener(handlePortMessage);
            port.onDisconnect.addListener(handlePortDisconnect);
        }
        //port.postMessage({ id: "ping", src: "editor" });
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  DOM element connection and event handlers
//
////////////////////////////////////////////////////////////////////////////////

async function onLoad() {
    try {
        console.debug("editor page loading");

        if (hasLoaded) {
            throw new Error("redundant load event");
        }
        hasLoaded = true;

        await enableTab("classes", true);
        await enableTab("books", false);
        await enableTab("options", false);
        await enableTab("advanced", false);
        await enableTab("help", false);

        // set advanced tab visible state from the local.storage config
        await setAdvancedTabVisible();

        tab.classes.controls.accountSelect.disabled = true;
        await tab.classes.enableControls(false);

        tab.books.controls.accountSelect.disabled = true;
        await tab.books.enableControls(false);

        await populateAccountSelect();

        await enableTab("advanced", true);
        await enableTab("help", true);

        await tab.options.populate();
        await enableTab("options", true);

        await tab.classes.populate();

        await enableTab("classes", true);
        await enableTab("books", true);

        console.debug("editor page loaded");
    } catch (e) {
        console.error(e);
    }
}

async function onUnload() {
    try {
        if (port) {
            port.disconnect();
            port = null;
        }
    } catch (e) {
        console.error(e);
    }
}

async function onStorageChange(changes, areaName) {
    if (areaName == "local") {
        const change = changes.advancedTabVisible;
        if (change !== undefined) {
            await setAdvancedTabVisible(change.newValue ? true : false);
        }
    }
}

async function onCancelClick() {
    try {
        window.close();
    } catch (e) {
        console.error(e);
    }
}

async function onOkClick(sender) {
    try {
        var state = undefined;
        switch (sender.target) {
            case tab.classes.okButton:
                state = await tab.classes.saveChanges();
                break;
            case tab.books.okButton:
                state = await tab.books.saveChanges();
                break;
        }
        if (typeof state === "object" && state.success) {
            window.close();
        }
    } catch (e) {
        console.error(e);
    }
}

function addControl(name, elementId, eventName = null, handler = null) {
    try {
        return addTabControl(undefined, name, elementId, eventName, handler);
    } catch (e) {
        console.error(e);
    }
}

function addTabControl(tab, name, elementId, eventName = null, handler = null) {
    try {
        var element = document.getElementById(elementId);
        if (!element) {
            throw new Error(`addControl: ${elementId} not found`);
        }
        if (tab !== undefined) {
            tab.controls[name] = element;
        } else {
            controls[name] = element;
        }

        if (eventName) {
            element.addEventListener(eventName, handler);
        }
    } catch (e) {
        console.error(e);
    }
}

async function onOptionsDomainCheckboxChange(sender) {
    try {
        await tab.options.onDomainCheckboxChange(sender);
    } catch (e) {
        console.error(e);
    }
}

async function onClassesInputKeypress(sender) {
    try {
        await tab.classes.onInputKeypress(sender);
    } catch (e) {
        console.error(e);
    }
}

async function onClasessNameChanged() {
    try {
        await tab.classes.onNameChanged();
    } catch (e) {
        console.error(e);
    }
}

async function onClassesSliderMoved(sender) {
    try {
        await tab.classes.onSliderMoved(sender);
    } catch (e) {
        console.error(e);
    }
}

async function onClassesScoreChanged(sender) {
    try {
        await tab.classes.onScoreChanged(sender);
    } catch (e) {
        console.error(e);
    }
}

async function onClassesCellDelete(sender) {
    try {
        await tab.classes.onCellDelete(sender);
    } catch (e) {
        console.error(e);
    }
}

async function onClassesCellInsert(sender) {
    try {
        await tab.classes.onCellInsert(sender);
    } catch (e) {
        console.error(e);
    }
}

// classes tab controls
addTabControl(tab.classes, "accountSelect", "classes-account-select", "change", onAccountSelectChange);
addTabControl(tab.classes, "statusMessage", "classes-status-message-span");
addTabControl(tab.classes, "classTable", "class-table", "change", (sender) => {
    tab.classes.onTableChange(sender);
});
addTabControl(tab.classes, "tableBody", "level-table-body");
addTabControl(tab.classes, "tableGridRow", "table-grid-row");
addTabControl(tab.classes, "tableGridColumn", "table-grid-column");
addTabControl(tab.classes, "defaultsButton", "defaults-button", "click", () => {
    tab.classes.onDefaultsClick();
});
addTabControl(tab.classes, "refreshButton", "refresh-button", "click", () => {
    tab.classes.onRefreshClick();
});
addTabControl(tab.classes, "applyButton", "classes-apply-button", "click", () => {
    tab.classes.onApplyClick();
});
addTabControl(tab.classes, "okButton", "classes-ok-button", "click", onOkClick);
addTabControl(tab.classes, "cancelButton", "classes-cancel-button", "click", onCancelClick);

// books tab controls
addTabControl(tab.books, "accountSelect", "books-account-select", "change", onAccountSelectChange);
addTabControl(tab.books, "statusMessage", "books-status-message-span");
addTabControl(tab.books, "editRow", "books-edit-row-stack");

addTabControl(tab.books, "booksLabel", "books-label");
addTabControl(tab.books, "booksStack", "books-stack");
addTabControl(tab.books, "booksInput", "book-input");
addTabControl(tab.books, "booksAddButton", "book-add-button", "click", () => {
    tab.books.onBooksAdd();
});
addTabControl(tab.books, "booksDeleteButton", "book-delete-button", "click", () => {
    tab.books.onBooksDelete();
});

addTabControl(tab.books, "addrsLabel", "addresses-label");
addTabControl(tab.books, "addrsStack", "addresses-stack");
addTabControl(tab.books, "addrsInput", "address-input");
addTabControl(tab.books, "addrsAddButton", "address-add-button", "click", () => {
    tab.books.onAddrsAddClick();
});
addTabControl(tab.books, "addrsDeleteButton", "address-delete-button", "click", () => {
    tab.books.onAddrsDeleteClick();
});

addTabControl(tab.books, "applyButton", "books-apply-button", "click", () => {
    tab.books.onApplyClick();
});
addTabControl(tab.books, "okButton", "books-ok-button", "click", onOkClick);
addTabControl(tab.books, "cancelButton", "books-cancel-button", "click", onCancelClick);

// options tab controls
addTabControl(tab.options, "autoDelete", "options-auto-delete-checkbox", "change", () => {
    tab.options.onAutoDeleteChange();
});
addTabControl(tab.options, "advancedTabVisible", "options-show-advanced-checkbox", "change", () => {
    tab.options.onShowAdvancedTabChange();
});
addTabControl(tab.options, "minimizeCompose", "options-minimize-compose-checkbox", "change", () => {
    tab.options.onMinimizeComposeChange();
});
addTabControl(tab.options, "resetButton", "options-reset-button", "click", () => {
    tab.options.onResetClick();
});
addTabControl(tab.options, "domainsStack", "options-domains-stack");
addTabControl(tab.options, "domainsApplyButton", "options-domains-apply-changes", "click", () => {
    tab.options.onDomainsApplyClick();
});
addTabControl(tab.options, "domainsCancelButton", "options-domains-cancel-changes", "click", () => {
    tab.options.populateDomains();
});

// advanced tab controls
addTabControl(tab.advanced, "selectedAccount", "advanced-selected-account-input");
addTabControl(tab.advanced, "command", "advanced-command-select", "change", (sender) => {
    tab.advanced.onCommandChange(sender);
});
addTabControl(tab.advanced, "argument", "advanced-argument-input");
addTabControl(tab.advanced, "sendButton", "advanced-send-button", "click", () => {
    tab.advanced.onSendClick();
});
addTabControl(tab.advanced, "output", "advanced-output");

// help tab controls
addTabControl(tab.help, "helpText", "help-text");

// tabs
addControl("classesTab", "tab-classes");
addControl("booksTab", "tab-books");
addControl("optionsTab", "tab-options");
addControl("advancedTab", "tab-advanced");
addControl("helpTab", "tab-help");

// tablinks
addControl("classesTabLink", "tab-classes-link");
addControl("booksTabLink", "tab-books-link");
addControl("optionsTabLink", "tab-options-link");
addControl("advancedTabLink", "tab-advanced-link");
addControl("helpTabLink", "tab-help-link");

// navlinks
addControl("classesNavLink", "classes-navlink", "shown.bs.tab", onTabShow);
addControl("booksNavLink", "books-navlink", "shown.bs.tab", onTabShow);
addControl("optionsNavLink", "options-navlink", "shown.bs.tab", onTabShow);
addControl("advancedNavLink", "advanced-navlink", "shown.bs.tab", onTabShow);
addControl("helpNavLink", "help-navlink", "shown.bs.tab", onTabShow);

// handlers for request port RPC commands
requests.addHandler("selectAccount", handleSelectAccount);
requests.addHandler("selectEditorTab", handleSelectEditorTab);

// handler for global runtime messages
messenger.runtime.onMessage.addListener(handleMessage);

// DOM event handlers
window.addEventListener("load", onLoad);
window.addEventListener("beforeunload", onUnload);
messenger.storage.onChanged.addListener(onStorageChange);
