import { initThemeSwitcher } from "./theme_switcher.js";
import { config } from "./config.js";
import { differ, accountEmailAddress } from "./common.js";
import { ClassesTab } from "./tab_classes.js";
import { BooksTab } from "./tab_books.js";
import { OptionsTab } from "./tab_options.js";
import { AdvancedTab } from "./tab_advanced.js";
import { HelpTab } from "./tab_help.js";
import { generateUUID } from "./common.js";

// FIXME: add refresh command to filterctl to get classes, books,  account data in one filterctl response

// FIXME: implement all element event listeners here and call functions on tab objects
// FIXME: share controls container between this page and all tab objects

/* globals messenger, window, document, console */
const verbose = false;

const disconnectOnBackgroundSuspend = false;

initThemeSwitcher();

let hasLoaded = false;
let backgroundSuspended = false;
let usagePopulated = false;
let accountsPopulated = false;

let activeTab = "classes";

// buffer programatic updates when controls are unpopulated or disabled
let bufferedSelectTab = undefined;
let bufferedSelectAccount = undefined;

// map between select element index and accountId
let accountIndex = {};

// keep accounts and selectedAccounts state
let accounts = undefined;
let selectedAccount = undefined;

// connection state vars
let port = null;
let backgroundCID = null;
const editorCID = "editor-" + generateUUID();

let controls = {};

let tab = {
    classes: new ClassesTab(disableEditorControl, sendMessage, enableTab, {
        InputKeypress: onClassesInputKeypress,
        NameChanged: onClasessNameChanged,
        SliderMoved: onClassesSliderMoved,
        ScoreChanged: onClassesScoreChanged,
        CellDelete: onClassesCellDelete,
        CellInsert: onClassesCellInsert,
    }),
    books: new BooksTab(disableEditorControl, sendMessage),
    options: new OptionsTab(sendMessage, { DomainCheckboxChange: onOptionsDomainCheckboxChange }),
    advanced: new AdvancedTab(sendMessage),
    help: new HelpTab(sendMessage),
};

////////////////////////////////////////////////////////////////////////////////
//
//  selected account init
//
////////////////////////////////////////////////////////////////////////////////

// called from the background page message handler
async function populateAccounts(updateAccounts = undefined, updateSelectedAccount = undefined) {
    try {
        if (verbose) {
            console.debug("BEGIN populateAccounts");
        }

        if (updateAccounts === undefined) {
            updateAccounts = await sendMessage({ id: "getAccounts" });
        }
        if (updateSelectedAccount == undefined) {
            updateSelectedAccount = await sendMessage({ id: "getSelectedAccount" });
        }

        if (accountsPopulated && !differ(updateAccounts, accounts) === false) {
            console.warn("populateAccounts: accounts unchanged, skipping populate");
        } else {
            // disable the select controls while updating
            await enableAccountControls(false);

            // clear account select contents
            tab.classes.controls.accountSelect.innerHTML = "";
            tab.books.controls.accountSelect.innerHTML = "";
            tab.advanced.controls.selectedAccount.value = "";

            // initialize the select control dropdown lists
            if (verbose) {
                console.debug("editor.populateAccounts:", {
                    updateAccounts: updateAccounts,
                    updateSelectedAccount: updateSelectedAccount,
                });
            }

            let i = 0;
            accountIndex = {};
            for (let [id, account] of Object.entries(updateAccounts)) {
                if (verbose) {
                    console.debug({ i: i, id: id, account: account });
                }
                accountIndex[account.id] = i;
                accountIndex[i] = account.id;
                addAccountSelectRow(tab.classes.controls.accountSelect, id, accountEmailAddress(account));
                addAccountSelectRow(tab.books.controls.accountSelect, id, accountEmailAddress(account));
                i++;
            }

            // set the accounts here and in the tabs that need them
            accounts = updateAccounts;

            /*
            switch (activeTab) {
                case "classes":
                    await tab.classes.populate();
                    break;
                case "books":
                    await tab.books.populate();
                    break;
                case "options":
                    await tab.options.populate();
                    break;
            }
	    */

            // enable the select controls
            await enableAccountControls(false);

            // enable the tabs
            await enableTab("classes", true);
            await enableTab("books", true);
            await enableTab("options", true);
            await enableTab("advanced", true);
            await enableTab("help", true);

            accountsPopulated = true;
        }

        await selectAccount(updateSelectedAccount.id);

        if (bufferedSelectTab) {
            if (verbose) {
                console.log("applying buffered tab selection:", bufferedSelectTab);
            }
            await selectTab(bufferedSelectTab);
            bufferedSelectTab = undefined;
        }

        if (verbose) {
            console.debug("END populateAccountSelect", { accounts: accounts, selectedAccount: selectedAccount });
        }
    } catch (e) {
        console.error(e);
    }
}

function addAccountSelectRow(control, id, name) {
    try {
        const option = document.createElement("option");
        option.setAttribute("data-account-id", id);
        option.textContent = name;
        if (verbose) {
            console.debug("addAccountSelectRow:", control, id, name);
        }
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

////////////////////////////////////////////////////////////////////////////////
//
// selectAccount:   set the account elements and selectedAccount variable
//		    to synchronize the selected account when changed
//
// callers:
//  - populateAccounts - the select controls have been (re)initialized
//  - onAccountSelectChange - one of the select controls has been changed
//  - handleUpdateEditorSelectedAccount - background page requests message handler
//
////////////////////////////////////////////////////////////////////////////////

// FIXME: this should be called updateSelectedAccountControlState
async function selectAccount(accountId) {
    try {
        if (verbose) {
            console.debug("selectAccount:", accountId);
        }
        if (typeof accountId !== "string") {
            throw new Error("selectAccount: unexpected accountId type:", accountId);
        }
        let index = accountIndex[accountId];
        selectedAccount = accounts[accountId];
        if (index === undefined || selectedAccount === undefined) {
            console.error("selectAccount: unknown accountId:", accountId);
            throw new Error("unknown account");
            //return false;
        }

        // classes
        tab.classes.controls.accountSelect.selectedIndex = index;
        tab.classes.selectedAccount = selectedAccount;
        await tab.classes.populate();

        // books
        tab.books.controls.accountSelect.selectedIndex = index;
        tab.books.selectedAccount = selectedAccount;
        tab.books.populate();

        // advanced
        tab.advanced.controls.selectedAccount.value = accountEmailAddress(selectedAccount);
        tab.advanced.selectedAccount = selectedAccount;

        if (verbose) {
            console.log("account selected:", accountEmailAddress(selectedAccount));
        }
        return true;
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
// event handlers
//
// handle classes and books select control changed events
//
// callers:
//  - tab.classes.controls.accountSelect
//  - tab.books.controls.accountSelect
//
////////////////////////////////////////////////////////////////////////////////
async function onAccountSelectChange(sender) {
    try {
        const index = sender.target.selectedIndex;
        if (verbose) {
            console.debug("onAccountSelectChange:", index, sender.target.id);
        }
        if (sender.target === tab.classes.controls.accountSelect || sender.target === tab.books.controls.accountSelect) {
            const accountId = accountIndex[index];
            await selectAccount(accountId);
            // slected account changed by user action, inform the background page
            await sendMessage({ id: "selectAccount", account: accountId });
        } else {
            throw new Error("onAccountSelectChange: unexpected event sender:", sender);
        }
    } catch (e) {
        console.error(e);
    }
}

////////////////////////////////////////////////////////////////////////////////
//
//  tab management
//
////////////////////////////////////////////////////////////////////////////////

function getTabControls(name) {
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
        return { tab: tab, link: link, navlink: navlink };
    } catch (e) {
        console.error(e);
    }
}

function enableTab(name, enabled) {
    try {
        const tabControls = getTabControls(name);

        tabControls.link.disabled = !enabled;
        if (enabled) {
            tabControls.navlink.classList.remove("disabled");
        } else {
            tabControls.navlink.classList.add("disabled");
        }
        if (verbose) {
            console.log(enabled ? "enabled tab: " : "disabled tab:", {
                tabId: tabControls.tab.id,
                link: tabControls.link.id,
                navLink: tabControls.navlink.id,
            });
        }
    } catch (e) {
        console.error(e);
    }
}

async function onTabShow(sender) {
    try {
        if (verbose) {
            console.debug("handleTabShow:", sender);
        }
        let cancelVisible = false;
        let applyVisible = false;
        let okButtonText = "Close";
        switch (sender.srcElement) {
            case controls.classesNavLink:
                activeTab = "classes";
                await tab.classes.populate();
                cancelVisible = true;
                applyVisible = true;
                okButtonText = "Ok";
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
        if (verbose) {
            console.log("active tab:", activeTab);
        }
        controls.cancelButton.hidden = !cancelVisible;
        controls.applyButton.hidden = !applyVisible;
        controls.okButton.textContent = okButtonText;
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
            tab.advanced.setStatus("Updating commands...");
            tab.help.controls.helpText.innerHTML = "Updating help...";
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
            console.debug("requesting usage:", message);
        }
        const response = await sendMessage(message);
        if (verbose) {
            console.debug("usageResponse:", response);
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

async function handleUpdateEditorAccounts(message) {
    try {
        if (verbose) {
            console.debug("handleUpdateEditorAccounts:", message);
        }
        //FIXME: await populateAccounts(message.accounts, message.selectedAccount);
        return true;
    } catch (e) {
        console.error(e);
    }
}

async function handleUpdateEditorSelectedAccount(message) {
    try {
        if (verbose) {
            console.debug("handleUpdateEditorSelectedAccount:", message);
        }
        let warnings = [];
        let success = false;
        if (!accountsPopulated) {
            warnings.push("handleUpdateEditorSelectedAccount: accounts not populated");
        }
        if (tab.classes.controls.accountSelect.disabled) {
            warnings.push("handleUpdateEditorSelectedAccount: classes account controls disabled");
        }
        if (tab.books.controls.accountSelect.disabled) {
            warnings.push("handleUpdateEditorSelectedAccount: books account controls disabled");
        }
        if (warnings.length > 0) {
            console.warn("handleUpdateEditorSelectedAccount: updating buffered message:", {
                detail: warnings,
                previousBuffer: bufferedSelectAccount,
                newBuffer: message.account,
            });
            bufferedSelectAccount = message.account;
        } else {
            success = await selectAccount(message.account.id);
        }
        return success;
    } catch (e) {
        console.error(e);
    }
}

async function handleSelectEditorTab(message) {
    try {
        if (verbose) {
            console.debug("handleSelectEditorTab:", message);
        }
        let tabName = message.name;
        let success = await selectTab(tabName);
        if (success !== true) {
            bufferedSelectTab = tabName;
            console.warn("handleSelectEditorTab: requested tab disabled, tab selection change deferred:", message);
        }
        return success;
    } catch (e) {
        console.error(e);
    }
}

// return bool: true if successfully changed
async function selectTab(name) {
    try {
        if (verbose) {
            console.debug("selectTab:", name);
        }
        let link = undefined;
        switch (name) {
            case "classes":
                link = controls.classesNavLink;
                break;
            case "books":
                link = controls.booksNavLink;
                break;
            case "options":
                link = controls.optionsNavLink;
                break;
            case "advanced":
                link = controls.advancedNavLink;
                break;
            case "help":
                link = controls.helpNavLink;
                break;
        }
        if (link === undefined) {
            throw new Error("selectTab: unexpected tab name:", name);
        }
        if (link.disabled) {
            console.warn("selectTab: tab link disabled:", { name: name, link: link });
            return false;
        }
        link.click();
        if (verbose) {
            console.log("tab selected:", name);
        }
        return true;
    } catch (e) {
        console.error(e);
    }
}

async function disableEditorControl(id, disable) {
    try {
        if (verbose) {
            console.log("disableEditorControl:", id, disable);
        }
        let control = controls[id];
        control.disabled = disable;
    } catch (e) {
        console.error(e);
    }
}

///////////////////////////////////////////////////////////////////////////////
//
//  messages handlers
//
///////////////////////////////////////////////////////////////////////////////

async function connect() {
    try {
        if (port === null) {
            if (verbose) {
                console.debug("editor: requesting background page...");
            }
            const background = await messenger.runtime.getBackgroundPage();
            backgroundSuspended = false;
            if (verbose) {
                console.debug("background: page:", { url: background, suspended: backgroundSuspended });
            }

            backgroundCID = null;
            if (verbose) {
                console.log("editor connecting to background as:", editorCID);
            }
            port = await messenger.runtime.connect(undefined, { name: editorCID });
            port.onMessage.addListener(onPortMessage);
            port.onDisconnect.addListener(onDisconnect);
            if (verbose) {
                console.debug("editor: connection pending on port:", port);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function disconnect() {
    try {
        if (port !== null) {
            if (verbose) {
                console.debug("editor disconnecting:", {
                    port: port,
                    editor: editorCID,
                    background: backgroundCID,
                });
            }
            await port.disconnect();
            // FIXME: maybe let the onDisconnect clear these?
            port = null;
            backgroundCID = null;
        }
    } catch (e) {
        console.error(e);
    }
}

async function onPortMessage(message, sender) {
    try {
        if (verbose) {
            console.debug("editor.onPortMessage:", message, sender);
        }
        let ret = undefined;
        switch (message.id) {
            case "ENQ":
                if (message.dst !== editorCID) {
                    throw new Error("destination CID mismatch");
                }
                backgroundCID = message.src;
                if (verbose) {
                    console.debug("editor: set background CID:", backgroundCID);
                }
                ret = await messenger.runtime.sendMessage({ id: "ACK", src: editorCID, dst: backgroundCID });
                if (verbose) {
                    console.debug("ACK returned:", ret);
                }
                console.log("editor connected to:", backgroundCID);
                // complete initialization now that we're connected to the background page
                await populateAccounts();
                break;
            default:
                throw new Error("unexpected port message");
        }
    } catch (e) {
        console.error(e);
    }
}

async function onMessage(message, sender) {
    try {
        if (verbose) {
            console.debug("editor.onMessage:", message, sender);
        }

        // process messages allowed without connection
        switch (message.id) {
            case "backgroundActivated":
                backgroundSuspended = false;
                await connect();
                return;
            case "backgroundSuspendCanceled":
                if (backgroundSuspended) {
                    await connect();
                }
                return;
            case "backgroundSuspending":
                if (disconnectOnBackgroundSuspend) {
                    await disconnect();
                }
                //backgroundSuspended = true;
                //await onUnload();
                return;
        }

        if (backgroundCID === null) {
            console.error("not connected, discarding:", message);
            return;
        }

        if (message.src === undefined || message.dst === undefined) {
            console.error("missing src/dst, discarding:", message);
            return;
        }

        if (message.src !== backgroundCID) {
            console.error("unexpected src ID, discarding:", message);
            return;
        }

        if (message.dst !== editorCID) {
            console.error("unexpected dst ID, discarding:", message);
            return;
        }

        let response = undefined;

        switch (message.id) {
            case "selectEditorTab":
                response = await handleSelectEditorTab(message);
                break;

            case "updateEditorAccounts":
                response = handleUpdateEditorAccounts(message);
                break;

            case "updateEditorSelectedAccount":
                response = await handleUpdateEditorSelectedAccount(message);
                break;

            default:
                console.error("unknown message ID:", message);
                break;
        }
        if (response !== undefined) {
            if (typeof response !== "object") {
                response = { response: response };
            }
            if (verbose) {
                console.debug("editor.onMessage: sending response:", response);
            }
        }
        return response;
    } catch (e) {
        console.error(e);
    }
}

async function onDisconnect(port) {
    try {
        if (verbose) {
            console.log("editor: onDisconnect:", {
                port: port,
                editor: editorCID,
                background: backgroundCID,
                backgroundSuspended: backgroundSuspended,
            });
        }
        port = null;
        backgroundCID = null;
        backgroundSuspended = true;
    } catch (e) {
        console.error(e);
    }
}

async function sendMessage(message) {
    try {
        if (port === null || backgroundCID === null) {
            console.error("SendMessage: port not connected:", port, editorCID, backgroundCID, message);
            throw new Error("SendMessage: port not connected");
        }
        if (typeof message === "string") {
            message = { id: message };
        }
        message.src = editorCID;
        message.dst = backgroundCID;
        if (verbose) {
            console.debug("editor.sendMessage:", message);
        }
        let result = await messenger.runtime.sendMessage(message);
        if (verbose) {
            console.debug("editor.sendMessage returned:", result);
        }
        return result;
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
        if (verbose) {
            console.debug("editor page loading");
        }

        if (hasLoaded) {
            throw new Error("redundant load event");
        }
        hasLoaded = true;

        // disable all tabs and account select until we receive accounts from the background page
        await enableTab("classes", false);
        await enableTab("books", false);
        await enableTab("options", false);
        await enableTab("advanced", false);
        await enableTab("help", false);
        await enableAccountControls(false);

        // set advanced tab visible state from the local.storage config
        await setAdvancedTabVisible();

        await connect();

        if (verbose) {
            console.debug("editor page loaded");
        }
    } catch (e) {
        console.error(e);
    }
}

async function enableAccountControls(enabled) {
    try {
        if (verbose) {
            console.debug("enableAccountControls:", enabled);
        }
        await tab.classes.enableControls(enabled);
        await tab.books.enableControls(enabled);
    } catch (e) {
        console.error(e);
    }
}

async function onUnload() {
    try {
        await disconnect();
    } catch (e) {
        console.error(e);
    }
}

async function onStorageChange(changes, areaName) {
    if (verbose) {
        console.debug("editor: onStorageChange:", changes, areaName);
    }
    if (areaName == "local") {
        const change = changes.advancedTabVisible;
        if (change !== undefined) {
            await setAdvancedTabVisible(change.newValue ? true : false);
        }
    }
}

async function onApplyClick() {
    try {
        await tab.classes.saveChanges();
        await tab.books.saveChanges();
    } catch (e) {
        console.error(e);
    }
}

async function onCancelClick() {
    try {
        window.close();
    } catch (e) {
        console.error(e);
    }
}

async function onOkClick() {
    try {
        console.log("okButtonClick");
        var state = undefined;
        switch (activeTab) {
            case "classes":
                state = await tab.classes.saveChanges();
                break;
            default:
                state = { success: true };
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
addTabControl(tab.classes, "statusLabel", "classes-status-label-span");
addTabControl(tab.classes, "classTable", "class-table", "change", (sender) => {
    tab.classes.onTableChange(sender);
});
addTabControl(tab.classes, "tableBody", "level-table-body");
addTabControl(tab.classes, "tableGridRow", "table-grid-row");
addTabControl(tab.classes, "tableGridColumn", "table-grid-column");
addTabControl(tab.classes, "saveButton", "classes-save-button", "click", () => {
    tab.classes.onSaveClick();
});
addTabControl(tab.classes, "defaultsButton", "classes-defaults-button", "click", () => {
    tab.classes.onDefaultsClick();
});
addTabControl(tab.classes, "refreshButton", "classes-refresh-button", "click", () => {
    tab.classes.onRefreshClick();
});
addTabControl(tab.classes, "refreshAllButton", "classes-refresh-all-button", "click", () => {
    tab.classes.onRefreshAllClick();
});

// books tab controls
addTabControl(tab.books, "accountSelect", "books-account-select", "change", onAccountSelectChange);
addTabControl(tab.books, "bookSelect", "books-filterbook-select", "change", (e) => {
    tab.books.onBookSelectChange(e);
});
addTabControl(tab.books, "addressesSelect", "books-addresses-select", "change", (e) => {
    tab.books.onAddressesSelectChange(e);
});
addTabControl(tab.books, "statusMessage", "books-status-message-span");

addTabControl(tab.books, "selectedSpan", "books-add-sender-span");
addTabControl(tab.books, "selectButton", "books-add-sender-button", "click", () => {
    tab.books.onSelectClick();
});

addTabControl(tab.books, "connectedLabel", "books-connected-label");
addTabControl(tab.books, "connectedCheckbox", "books-connected-check", "change", (e) => {
    tab.books.onConnectedChange(e);
});
addTabControl(tab.books, "scanButton", "books-scan-button", "click", () => {
    tab.books.onScanClick();
});
addTabControl(tab.books, "connectionsSelect", "books-connections-select", "change", (e) => {
    tab.books.onConnectionsSelectChange(e);
});
addTabControl(tab.books, "disconnectButton", "books-disconnect-button", "click", () => {
    tab.books.onDisconnectClick();
});

addTabControl(tab.books, "addInput", "books-add-input", "keyup", (e) => {
    tab.books.onAddInputKeyup(e);
});
addTabControl(tab.books, "addButton", "books-add-button", "click", () => {
    tab.books.onAddClick();
});

addTabControl(tab.books, "deleteInput", "books-delete-input", "keyup", (e) => {
    tab.books.onDeleteInputKeyup(e);
});
addTabControl(tab.books, "deleteButton", "books-delete-button", "click", () => {
    tab.books.onDeleteClick();
});

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
addTabControl(tab.advanced, "status", "advanced-status-span");
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

addControl("applyButton", "apply-button", "click", onApplyClick);
addControl("okButton", "ok-button", "click", onOkClick);
addControl("cancelButton", "cancel-button", "click", onCancelClick);

// handler for runtime broadcast messages
messenger.runtime.onMessage.addListener(onMessage);

// DOM event handlers
window.addEventListener("load", onLoad);
window.addEventListener("beforeunload", onUnload);
messenger.storage.onChanged.addListener(onStorageChange);
