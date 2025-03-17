import * as requests from "./requests.js";
import { differ } from "./common.js";
import { initThemeSwitcher } from "./theme_switcher.js";

/* globals browser, window, document, console, setTimeout, clearTimeout */
const verbose = false;

initThemeSwitcher();

const MIN_LEVELS = 2;
const MAX_LEVELS = 16;
const STATUS_PENDING_TIMEOUT = 5120;
var statusPendingTimer;
var backgroundSuspended = false;
var usagePopulated = false;
var activeTab = null;
var commandUsage = {};

var accountNames = {};
var accountIndex = {};
var port = null;
var controls = {};

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
        return await updateClassesStatus(state);
    } catch (e) {
        console.error(e);
    }
}

async function statusPendingTimeout() {
    await updateClassesStatus({ error: true, message: "Pending operation timed out." });
}

async function setStatusPending(message) {
    try {
        if (statusPendingTimer) {
            clearTimeout(statusPendingTimer);
        }
        statusPendingTimer = setTimeout(statusPendingTimeout, STATUS_PENDING_TIMEOUT);
        await updateClassesStatus({ message: message, disable: true });
    } catch (e) {
        console.error(e);
    }
}

async function updateClassesStatus(state = undefined) {
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
            console.log("updateClassesStatus:", state);
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

        controls.classesApplyButton.disabled = state.disable;
        controls.accountSelect.disabled = state.disable;
        controls.classesOkButton.disabled = state.disable;
    } catch (e) {
        console.error(e);
    }
}

async function saveChanges() {
    try {
        await setStatusPending("sending changed classes...");
        const state = await sendMessage({ id: "sendAllClassLevels", force: false });
        await updateClassesStatus(state);
        return state;
    } catch (e) {
        console.error(e);
        await updateClassesStatus({ error: true, message: "Pending operation failed." });
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
        await sendMessage("refreshAllClassLevels");
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
        setAdvancedOutput(JSON.stringify(message, null, 2) + "\n\nAwaiting filterctl response...");
        const response = await sendMessage(message);
        if (verbose) {
            console.debug("response:", response);
        }
        if (response == undefined) {
            setAdvancedOutput("Error: server communication failed");
        } else {
            setAdvancedOutput(JSON.stringify(response, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

function setAdvancedOutput(text) {
    try {
        const output = controls.advancedOutput;
        output.style.height = "0px";
        output.value = text;
        output.style.height = `${output.scrollHeight + 10}px`;
    } catch (e) {
        console.error(e);
    }
}

async function requestUsage() {
    try {
        const message = {
            id: "sendCommand",
            accountId: accountId(),
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

async function populateUsageControls() {
    try {
        if (!usagePopulated) {
            usagePopulated = true;
            const response = await requestUsage();
            if (response) {
                await populateHelpText(response.Help);
                await populateAdvancedCommandSelect(response.Commands);
            } else {
                usagePopulated = false;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function populateHelpText(helpLines) {
    try {
        var text = "";
        for (var line of helpLines) {
            //console.log("line: ", "'" + line + "'");
            line = line.replace(/^\s*/, "");
            line = line.replace(/\s*$/, "");
            line = line.replace(/^###+\s*/g, "<b>");
            line = line.replace(/^#+\s*/g, "<br><br><b>");
            line = line.replace(/\s*#+$/g, "</b><br>");
            text += " " + line + "\n";
            //console.log("line: ", "'" + line + "'");
            //console.log("---");
        }
        //console.debug(text);
        controls.helpText.innerHTML = text;
    } catch (e) {
        console.error(e);
    }
}

async function populateAdvancedCommandSelect(commandLines) {
    try {
        enableAdvancedCommandControls(false);
        controls.advancedCommand.innerHTML = "";
        if (verbose) {
            console.log("Commands:", commandLines);
        }
        var flag = false;
        commandUsage = {};
        var command = null;
        var usage = [];
        for (var line of commandLines) {
            if (line.substr(0, 4) === "----") {
                flag = true;
            } else {
                if (flag) {
                    if (command) {
                        commandUsage[command] = usage;
                    }
                    usage = [];
                    console.log("line:", line);
                    command = line.split(" ")[0];
                    if (command.length) {
                        const option = document.createElement("option");
                        option.textContent = command;
                        controls.advancedCommand.appendChild(option);
                    } else {
                        command = null;
                    }
                    flag = false;
                }
                usage.push(line);
            }
        }
        console.log("commandUsage:", commandUsage);
        enableAdvancedCommandControls(true);
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

async function populateAccountSelect() {
    try {
        if (verbose) {
            console.log("BEGIN populateAccountSelect");
        }
        const accounts = await sendMessage("getAccounts");
        controls.accountSelect.innerHTML = "";
        controls.booksAccountSelect.innerHTML = "";
        accountNames = {};
        var i = 0;
        for (let id of Object.keys(accounts)) {
            accountNames[id] = accounts[id].name;
            accountNames[i] = accounts[id].name;
            accountIndex[id] = i;
            accountIndex[i] = id;
            addAccountSelectRow(controls.accountSelect, i, id, accounts);
            addAccountSelectRow(controls.booksAccountSelect, i, id, accounts);
            i++;
        }
        const selectedAccountId = await sendMessage("getSelectedAccountId");
        await setSelectedAccount(selectedAccountId);
        controls.accountSelect.disabled = false;
        controls.booksAccountSelect.disabled = false;
        if (verbose) {
            console.log("END populateAccountSelect");
        }
    } catch (e) {
        console.error(e);
    }
}

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
        console.log(enabled ? "enabled tab: " : "disabled tab:", tab, link, navlink);
    } catch (e) {
        console.error(e);
    }
}

function enableAdvancedCommandControls(enabled) {
    try {
        controls.advancedCommand.disabled = !enabled;
        controls.advancedArgument.disabled = !enabled;
        controls.advancedSendButton.disabled = !enabled;
    } catch (e) {
        console.error(e);
    }
}

async function enableBooksTabControls(enabled) {
    try {
        await enableBooksControls(enabled);
        await enableAddressesControls(enabled);
        if (!enabled) {
            await enableBooksButtons(false, false, false);
        }
    } catch (e) {
        console.error(e);
    }
}

async function enableBooksButtons(apply, cancel, ok) {
    try {
        controls.booksApplyButton.disabled = !apply;
        controls.booksCancelButton.disabled = !cancel;
        controls.booksOkButton.disabled = !ok;
    } catch (e) {
        console.error(e);
    }
}

async function enableBooksControls(enabled) {
    try {
        controls.booksAddButton.disabled = !enabled;
        controls.booksDeleteButton.disabled = !enabled;
        controls.booksInput.disabled = !enabled;
    } catch (e) {
        console.error(e);
    }
}

async function enableAddressesControls(enabled) {
    try {
        controls.addressesAddButton.disabled = !enabled;
        controls.addressesDeleteButton.disabled = !enabled;
        controls.addressesInput.disabled = !enabled;
    } catch (e) {
        console.error(e);
    }
}

async function populateBooks() {
    try {
        console.log("populateBooks");
        await enableBooksTabControls(false);
    } catch (e) {
        console.error(e);
    }
}

async function setSelectedAccount(id) {
    try {
        console.log("setSelectedAccountId:", id, accountNames[id]);
        controls.accountSelect.selectedIndex = accountIndex[id];
        controls.booksAccountSelect.selectedIndex = accountIndex[id];
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
        const index = controls.accountSelect.selectedIndex;
        await onAccountSelectIndexChanged(index);
    } catch (e) {
        console.error(e);
    }
}

async function onBooksAccountSelectChange(event) {
    try {
        console.log("books account select changed:", event);
        const index = controls.booksAccountSelect.selectedIndex;
        await onAccountSelectIndexChanged(index);
    } catch (e) {
        console.error(e);
    }
}

async function onAccountSelectIndexChanged(index) {
    try {
        console.log("account select index changed:", index);
        controls.accountSelect.selectedIndex = index;
        controls.booksAccountSelect.selectedIndex = index;
        const id = accountId();
        console.log("accountId:", id);
        console.log("index:", accountIndex[id]);
        console.log("name:", accountNames[id]);
        const levels = await getClasses(id);
        controls.advancedSelectedAccount.value = accountNames[id];
        controls.booksAccountSelect.value = accountNames[id];
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function onAdvancedCommandChange(event) {
    try {
        console.log("advanced command select changed:", event);
        const index = controls.advancedCommand.selectedIndex;
        const command = controls.advancedCommand.value;
        console.log("advancedCommand:", index, command);
        controls.advancedOutput.innerHTML = "";
        var lines = commandUsage[command];
        console.log(lines);
        setAdvancedOutput(lines.join("\n"));
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

async function onLoad() {
    try {
        console.debug("editor page loading");

        if (hasLoaded) {
            throw new Error("redundant load event");
        }
        hasLoaded = true;
        controls.accountSelect.disabled = true;
        controls.booksAccountSelect.disabled = true;

        await enableTab("books", false);
        await enableTab("advanced", false);
        await enableTab("help", false);

        await enableAdvancedCommandControls(false);
        await enableBooksTabControls(false);
        await populateOptions();
        await populateAccountSelect();
        const levels = await getClasses(accountId());
        await populateRows(levels);

        await enableTab("books", true);
        await enableTab("advanced", true);
        await enableTab("help", true);

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

async function getClasses(accountId) {
    try {
        await setStatusPending("requesting classes...");
        return await sendMessage({ id: "getClassLevels", accountId: accountId });
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

async function handleTabShow(tab) {
    try {
        console.log("handleTabShow:", tab);
        switch (tab.srcElement) {
            case controls.classesNavLink:
                activeTab = "classes";
                break;
            case controls.booksNavLink:
                activeTab = "books";
                populateBooks();
                break;
            case controls.optionsNavLink:
                activeTab = "options";
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

// classes tab controls
addControl("accountSelect", "classes-account-select", "change", onAccountSelectChange);
addControl("statusMessage", "classes-status-message-span");
addControl("classTable", "class-table", "change", onTableChange);
addControl("tableBody", "level-table-body");
addControl("tableGridRow", "table-grid-row");
addControl("tableGridColumn", "table-grid-column");
addControl("defaultsButton", "defaults-button", "click", onDefaults);
addControl("refreshButton", "refresh-button", "click", onRefresh);
addControl("classesApplyButton", "classes-apply-button", "click", onApply);
addControl("classesOkButton", "classes-ok-button", "click", onOk);
addControl("classesCancelButton", "classes-cancel-button", "click", onCancel);

// books tab controls
addControl("booksAccountSelect", "books-account-select", "change", onBooksAccountSelectChange);
addControl("booksStatusMessage", "books-status-message-span");
addControl("booksEditRow", "books-edit-row-stack");

addControl("booksLabel", "books-label");
addControl("booksStack", "books-stack");
addControl("booksInput", "book-input");
addControl("booksAddButton", "book-add-button");
addControl("booksDeleteButton", "book-delete-button");

addControl("addressessLabel", "addresses-label");
addControl("addressesStack", "addresses-stack");
addControl("addressesInput", "address-input");
addControl("addressesAddButton", "address-add-button");
addControl("addressesDeleteButton", "address-delete-button");

addControl("booksApplyButton", "books-apply-button", "click", onApply);
addControl("booksOkButton", "books-ok-button", "click", onOk);
addControl("booksCancelButton", "books-cancel-button", "click", onCancel);

// options tab controls
addControl("optionsAutoDelete", "options-auto-delete-checkbox", "change", onAutoDeleteChange);
addControl("optionsShowAdvancedTab", "options-show-advanced-checkbox", "change", onShowAdvancedTabChange);

// advanced tab controls
addControl("advancedSelectedAccount", "advanced-selected-account-input");
addControl("advancedCommand", "advanced-command-select", "change", onAdvancedCommandChange);
addControl("advancedArgument", "advanced-argument-input");
addControl("advancedSendButton", "advanced-send-button", "click", onAdvancedSend);
addControl("advancedOutput", "advanced-output");

// help tab controls
addControl("helpText", "help-text");

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
addControl("classesNavLink", "classes-navlink", "shown.bs.tab", handleTabShow);
addControl("booksNavLink", "books-navlink", "shown.bs.tab", handleTabShow);
addControl("optionsNavLink", "options-navlink", "shown.bs.tab", handleTabShow);
addControl("advancedNavLink", "advanced-navlink", "shown.bs.tab", handleTabShow);
addControl("helpNavLink", "help-navlink", "shown.bs.tab", handleTabShow);

browser.runtime.onMessage.addListener(handleMessage);

window.addEventListener("load", onLoad);
window.addEventListener("beforeunload", onUnload);
