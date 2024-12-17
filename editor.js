import * as requests from "./requests.js";
import { differ } from "./common.js";
import { initThemeSwitcher } from "./theme_switcher.js";

/* globals browser, window, document, console, setTimeout, clearTimeout */
const verbose = false;

const MIN_LEVELS = 2;
const MAX_LEVELS = 16;
const STATUS_PENDING_TIMEOUT = 5120;
var statusPendingTimer;
var backgroundSuspended = false;

var accountNames = {};
var accountIndex = {};
var port = null;
var controls = {};

var helpContent = `
The mail server's spam classifier adds an 'X-Spam-Score' header to each incoming message. This header value is a decimal number generally ranging between -20.0 and +20.0.  
<br><br>
Higher scores indicate more spam characteristics.
<br><br>
After scoring, the rspam-classes filter adds an 'X-Spam-Class' header.  This header's value is set to the name of the class with the lowest threshold that is greater than the message score.  The class names are text that can be easily matched in a filtering rule.
<br><br>
Each message's spam score is compared to the thresholds of each class and The lowest (least spammy) class is assigned.  In other words, a message must have a score below a class threshold value to be assigned to that class.
<br><br>
This class editor exchanges data with the mail server by automatically sendng email messages to the special email address 'filterctl@SELECTED_ACCOUNT_DOMAIN'.  Each message sent will trigger a reply message.  By default these control messages are deleted from the Inbox and Sent mail folders.  There is an option to toggle automatic deletion of these messages.
`;

function getLevels() {
    try {
        let ret = [];
        let i = 0;
        while (true) {
            let nameElement = document.getElementById(`level-name-${i}`);
            if (!nameElement) {
                return ret;
            }
            let scoreElement = document.getElementById(`level-score-${i}`);
            let level = {
                name: nameElement.value,
            };
            if (level.name === "spam") {
                level.score = "999";
            } else {
                level.score = String(parseFloat(scoreElement.value));
            }
            ret.push(level);
            i += 1;
        }
    } catch (e) {
        console.error(e);
    }
}

async function onTableChange(event) {
    try {
        if (verbose) {
            console.log("table change:", event);
        }
        await updateClasses();
    } catch (e) {
        console.error(e);
    }
}

async function onCellDelete(event) {
    try {
        if (verbose) {
            console.log("cell delete");
        }
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        var levels = getLevels();
        levels.splice(row, 1);
        await sendMessage({ id: "setClassLevels", accountId: accountId(), levels: levels });
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function onSliderMoved(event) {
    try {
        if (verbose) {
            console.log("slider moved");
        }
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        let score = document.getElementById(`level-score-${row}`);
        score.value = event.srcElement.value;
        await updateClasses();
    } catch (e) {
        console.error(e);
    }
}

async function onScoreChanged(event) {
    try {
        if (verbose) {
            console.log("score changed");
        }
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        const slider = document.getElementById(`level-slider-${row}`);
        slider.value = `${event.srcElement.value}`;
        await updateClasses();
    } catch (e) {
        console.error(e);
    }
}

async function onNameChanged() {
    try {
        if (verbose) {
            console.log("name changed");
        }
        await updateClasses();
    } catch (e) {
        console.error(e);
    }
}

function newLevelName(levels) {
    try {
        let i = 0;
        while (true) {
            let name = `class${i}`;
            let found = false;
            for (let level of levels) {
                if (level.name === name) {
                    found = true;
                }
            }
            if (!found) {
                return name;
            }
            i += 1;
        }
    } catch (e) {
        console.error(e);
    }
}

async function onCellInsert(event) {
    try {
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        if (verbose) {
            console.log("cellInsert:", event, row);
        }
        let levels = getLevels();
        let newScore = parseFloat(levels[row].score);
        let nextScore = parseFloat(levels[row + 1].score);
        if (nextScore === 999) {
            newScore += 1;
        } else {
            newScore += (nextScore - newScore) / 2;
        }
        levels.splice(row + 1, 0, { name: newLevelName(levels), score: String(newScore) });
        await sendMessage({ id: "setClassLevels", accountId: accountId(), levels: levels });
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

function appendCell(row, index, id, control, text, disabled) {
    try {
        const cell = document.createElement("td");
        const element = document.createElement(control);
        if (control === "button") {
            element.textContent = text;
        } else {
            element.value = text;
        }
        for (const [key, value] of Object.entries(cellTemplate[id].attributes)) {
            element.setAttribute(key, value);
        }
        for (const value of cellTemplate[id].classes) {
            element.classList.add(value);
        }
        element.id = id + "-" + index;
        element.setAttribute("data-row", index);
        if (disabled) {
            element.disabled = true;
        }
        cell.appendChild(element);
        row.appendChild(cell);
        return element;
    } catch (e) {
        console.error(e);
    }
}

var cellTemplate = null;

async function initCellTemplate() {
    let cells = {
        "level-name": { id: "cell-class-input" },
        "level-score": { id: "cell-score-input" },
        "level-slider": { id: "cell-score-slider" },
        "level-delete": { id: "cell-add-button" },
        "level-insert": { id: "cell-delete-button" },
    };
    for (const key of Object.keys(cells)) {
        const el = document.getElementById(cells[key].id);
        if (verbose) {
            console.log("cell:", key, el);
        }
        cells[key].attributes = {};
        cells[key].classes = [];
        for (const name of el.getAttributeNames()) {
            switch (name) {
                case "id":
                    break;
                case "class":
                    break;
                default:
                    cells[key].attributes[name] = el.getAttribute(name);
                    break;
            }
        }
        for (const elClass of el.classList) {
            cells[key].classes.push(elClass);
        }
    }
    cells["level-name"].attributes.rstmsKeyFilter = "name";
    cells["level-score"].attributes.rstmsKeyFilter = "score";
    //cells["level-slider"].classes.push("flex-fill");
    cellTemplate = cells;
    if (verbose) {
        console.log("cellTemplate:", cellTemplate);
    }
}

async function onInputKeypress(event) {
    const key = String.fromCharCode(event.which);
    const element = event.srcElement;
    const mode = element.getAttribute("rstmsKeyFilter");
    if (mode) {
        const value = element.value.trim();
        switch (mode) {
            case "name":
                if (value.length == 0) {
                    if (!/^[a-zA-Z]$/.test(key)) {
                        event.preventDefault();
                    }
                } else {
                    if (!/^[a-zA-Z0-9_.-]$/.test(key)) {
                        event.preventDefault();
                    }
                }
                break;
            case "score":
                if (!/^[0-9.-]$/.test(key)) {
                    event.preventDefault();
                }
                break;
        }
    }
}

async function populateRows() {
    try {
        if (verbose) {
            console.log("BEGIN populateRows");
        }
        const levels = await getClasses(accountId());
        if (!cellTemplate) {
            if (verbose) {
                console.log(controls.tableBody.innerHTML);
            }
            initCellTemplate();
        }
        controls.tableBody.innerHTML = "";
        var index = 0;
        for (const level of levels) {
            const row = document.createElement("tr");
            let name = level.name;
            let score = level.score;
            let disabled = false;
            let sliderValue = `${score}`;
            if (index === levels.length - 1) {
                disabled = true;
                score = "infinite";
                sliderValue = "20.0";
            }
            const nameControl = appendCell(row, index, "level-name", "input", name, disabled);
            const scoreControl = appendCell(row, index, "level-score", "input", score, disabled);
            const sliderControl = appendCell(row, index, "level-slider", "input", sliderValue, disabled);
            if (!disabled) {
                nameControl.addEventListener("keypress", onInputKeypress);
                nameControl.addEventListener("change", onNameChanged);
                sliderControl.addEventListener("input", onSliderMoved);
                scoreControl.addEventListener("change", onScoreChanged);
                scoreControl.addEventListener("keypress", onInputKeypress);
            }
            let deleteDisabled = disabled | (levels.length <= MIN_LEVELS);
            const deleteButton = appendCell(row, index, "level-delete", "button", "delete", deleteDisabled);
            if (!deleteDisabled) {
                deleteButton.addEventListener("click", onCellDelete);
            }
            let addDisabled = disabled | (levels.length >= MAX_LEVELS);
            const insertButton = appendCell(row, index, "level-insert", "button", "+", addDisabled);
            if (!addDisabled) {
                insertButton.addEventListener("click", onCellInsert);
            }
            controls.tableBody.appendChild(row);
            index += 1;
        }

        // check that editedLevels returns the same data we set
        const controlLevels = getLevels();
        if (differ(levels, controlLevels)) {
            console.log("getClasses:", levels);
            console.log("controlLevels:", controlLevels);
            throw new Error("editedLevels() return differs from background getClasses() return");
        }

        await updateClasses();
        if (verbose) {
            console.log("END populateRows");
        }
    } catch (e) {
        console.error(e);
    }
}

async function updateClasses(sendToServer = false) {
    try {
        const id = accountId();

        await setStatusPending("sending classes...");
        let state = await sendMessage({
            id: sendToServer ? "sendClassLevels" : "setClassLevels",
            accountId: id,
            levels: getLevels(),
            name: accountNames[id],
        });
        return await updateStatus(state);
    } catch (e) {
        console.error(e);
    }
}

async function statusPendingTimeout() {
    await updateStatus({ error: true, message: "Pending operation timed out." });
}

async function setStatusPending(message) {
    try {
        if (statusPendingTimer) {
            clearTimeout(statusPendingTimer);
        }
        statusPendingTimer = setTimeout(statusPendingTimeout, STATUS_PENDING_TIMEOUT);
        await updateStatus({ message: message, disable: true });
    } catch (e) {
        console.error(e);
    }
}

async function updateStatus(state = undefined) {
    try {
        if (statusPendingTimer) {
            clearTimeout(statusPendingTimer);
            statusPendingTimer = null;
        }

        if (state == undefined) {
            state = {
                error: true,
                message: "unknown error",
            };
        }

        if (verbose) {
            console.log("updateStatus:", state);
        }

        let parts = [];

        if (state.error) {
            parts.push("Error");
        } else {
            if (state.dirty) {
                if (state.valid) {
                    parts.push("Unsaved Validated Changes");
                } else {
                    parts.push("Validatation Failed");
                    state.disable = true;
                }
            } else if (state.dirty === false) {
                parts.push("Unchanged");
            }
        }

        if (state.message) {
            let prefix = "";
            if (parts.length > 0) {
                prefix = ": ";
            }
            parts.push(prefix + state.message.trim());
        }
        controls.statusMessage.innerHTML = parts.join(" ");

        controls.applyButton.disabled = state.disable;
        controls.accountSelect.disabled = state.disable;
        controls.okButton.disabled = state.disable;
    } catch (e) {
        console.error(e);
    }
}

async function saveChanges() {
    try {
        await setStatusPending("sending changed classes...");
        const state = await sendMessage({ id: "sendAllClassLevels", force: false });
        await updateStatus(state);
        return state;
    } catch (e) {
        console.error(e);
        await updateStatus({ error: true, message: "Pending operation failed." });
    }
}

async function onApply() {
    try {
        await saveChanges();
    } catch (e) {
        console.error(e);
    }
}

async function onCancel() {
    try {
        window.close();
    } catch (e) {
        console.error(e);
    }
}

async function onOk() {
    try {
        let state = await saveChanges();
        if (typeof state === "object" && state.success) {
            window.close();
        }
    } catch (e) {
        console.error(e);
    }
}

async function onDefaults() {
    try {
        const levels = await sendMessage({ id: "setDefaultLevels", accountId: accountId() });
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function onRefresh() {
    try {
        await setStatusPending("requesting all classes...");
        await sendMessage("refreshAll");
        const levels = await getClasses(accountId());
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function onAdvancedSend() {
    try {
        const message = {
            id: "sendCommand",
            accountId: accountId(),
            command: controls.advancedCommand.value,
            argument: controls.advancedArgument.value,
        };
        const result = await sendMessage(message);

        const output = controls.advancedOutput;
        output.style.height = "0px";

        if (result == undefined) {
            output.value = "Error: server communication failed";
        } else {
            output.value = result.body;
        }
        output.style.height = `${output.scrollHeight}px`;
    } catch (e) {
        console.error(e);
    }
}

async function populateAccountSelect() {
    try {
        if (verbose) {
            console.log("BEGIN populateAccountSelect");
        }
        const accounts = await sendMessage("getAccounts");
        controls.accountSelect.innerHTML = "";
        accountNames = {};
        var i = 0;
        for (let id of Object.keys(accounts)) {
            const option = document.createElement("option");
            option.setAttribute("data-account-id", id);
            accountNames[id] = accounts[id].name;
            accountNames[i] = accounts[id].name;
            accountIndex[id] = i;
            accountIndex[i] = id;
            option.textContent = accounts[id].name;
            controls.accountSelect.appendChild(option);
            i++;
        }
        const selectedAccountId = await sendMessage("getSelectedAccountId");
        await setSelectedAccount(selectedAccountId);
        if (verbose) {
            console.log("END populateAccountSelect");
        }
    } catch (e) {
        console.error(e);
    }
}

async function setSelectedAccount(id) {
    try {
        console.log("setSelectedAccountId:", id, accountNames[id]);
        controls.accountSelect.selectedIndex = accountIndex[id];
        controls.advancedSelectedAccount.value = accountNames[id];
    } catch (e) {
        console.error(e);
    }
}

async function setAdvancedTabVisible(visible) {
    try {
        controls.advancedTab.hidden = !visible;
        controls.advancedTabLink.hidden = !visible;
        controls.optionsShowAdvancedTab.checked = visible;
        await sendMessage({ id: "setConfigValue", key: "advancedTabVisible", value: visible });
    } catch (e) {
        console.error(e);
    }
}

function accountId() {
    try {
        const index = controls.accountSelect.selectedIndex;
        const selectedOption = controls.accountSelect.options[index];
        return selectedOption.getAttribute("data-account-id");
    } catch (e) {
        console.error(e);
    }
}

async function onAccountSelectChange(event) {
    try {
        console.log("account select changed:", event);
        const id = accountId();
        console.log("accountId:", id);
        console.log("index:", accountIndex[id]);
        console.log("name:", accountNames[id]);
        const levels = await getClasses(id);
        controls.advancedSelectedAccount.value = accountNames[id];
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function populateOptions() {
    try {
        controls.optionsAutoDelete.checked = await sendMessage({ id: "getConfigValue", key: "autoDelete" });
        await setAdvancedTabVisible(await sendMessage({ id: "getConfigValue", key: "advancedTabVisible" }));
    } catch (e) {
        console.error(e);
    }
}

var hasLoaded = false;

async function handleLoad() {
    try {
        console.debug("editor page loading");

        if (hasLoaded) {
            throw new Error("redundant load event");
        }
        hasLoaded = true;
        controls.helpText.innerHTML = helpContent;
        await populateOptions();
        await populateAccountSelect();
        const levels = await getClasses(accountId());
        await populateRows(levels);

        console.debug("editor page loaded");
    } catch (e) {
        console.error(e);
    }
}

async function getClasses(accountId) {
    try {
        await setStatusPending("requesting classes...");
        return await sendMessage({ id: "getClassLevels", accountId: accountId });
    } catch (e) {
        console.error(e);
    }
}

async function handleUnload() {
    try {
        if (port) {
            port.disconnect();
            port = null;
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleSelectAccount(message) {
    try {
        console.log("selectAccount:", message);
        if (!controls.accountSelect.disabled) {
            await setSelectedAccount(message.accountId);
            await onAccountSelectChange(message);
        }
        return accountId();
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
            const background = await browser.runtime.getBackgroundPage();
            console.log("connecting to background page:", background);
            port = await browser.runtime.connect({ name: "editor" });
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

function addControl(name, elementId, eventName = null, handler = null) {
    try {
        var element = document.getElementById(elementId);
        if (!element) {
            throw new Error(`addControl: ${elementId} not found`);
        }
        controls[name] = element;
        if (eventName) {
            element.addEventListener(eventName, handler);
        }
    } catch (e) {
        console.error(e);
    }
}

async function onAutoDeleteChange() {
    await sendMessage({ id: "setConfigValue", key: "autoDelete", value: controls.optionsAutoDelete.checked });
}

async function onShowAdvancedTabChange() {
    await setAdvancedTabVisible(controls.optionsShowAdvancedTab.checked);
}

requests.addHandler("selectAccount", handleSelectAccount);
requests.addHandler("selectEditorTab", handleSelectEditorTab);

addControl("applyButton", "apply-button", "click", onApply);
addControl("okButton", "ok-button", "click", onOk);
addControl("cancelButton", "cancel-button", "click", onCancel);
addControl("defaultsButton", "defaults-button", "click", onDefaults);
addControl("refreshButton", "refresh-button", "click", onRefresh);
addControl("accountSelect", "account-select", "change", onAccountSelectChange);
addControl("tableBody", "level-table-body");
addControl("statusMessage", "status-message-span");
addControl("applyButton", "apply-button");
addControl("helpText", "help-text");
addControl("tableGridRow", "table-grid-row");
addControl("tableGridColumn", "table-grid-column");
addControl("classTable", "class-table", "change", onTableChange);
addControl("advancedCommand", "advanced-command-select");
addControl("advancedArgument", "advanced-argument-input");
addControl("advancedOutput", "advanced-output");
addControl("advancedSendButton", "advanced-send-button", "click", onAdvancedSend);
addControl("optionsAutoDelete", "options-auto-delete-checkbox", "change", onAutoDeleteChange);
addControl("advancedSelectedAccount", "advanced-selected-account-input");
addControl("optionsShowAdvancedTab", "options-show-advanced-checkbox", "change", onShowAdvancedTabChange);
addControl("advancedTab", "tab-advanced");
addControl("advancedTabLink", "tab-advanced-link");
addControl("classesNavLink", "classes-navlink");
addControl("optionsNavLink", "options-navlink");
addControl("advancedNavLink", "advanced-navlink");
addControl("helpNavLink", "help-navlink");

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);
browser.runtime.onMessage.addListener(handleMessage);
initThemeSwitcher();
