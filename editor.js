import * as requests from "./requests.js";
import { differ } from "./common.js";
import * as ports from "./ports.js";

/* globals browser, window, document, console */

const MIN_LEVELS = 2;
const MAX_LEVELS = 16;

var accountNames = {};
var accountIndex = {};
var port;
var controls = {};

var helpContent = `
The mail server's spam classifier adds an 'X-Spam-Score' header to each incoming message. This header value is a decimal number generally ranging between -20.0 and +20.0.  
<br><br>
Higher scores indicate more spam characteristics.
<br><br>
After scoring, the rspam-classes filter adds an 'X-Spam-Class' header.  This header's value is set to the name of the class with the lowest threshold that is greater than the message score.  The class names are text that can be easily matched in a filtering rule.
<br><br>
Each message's spam score is compared to the thresholds of each class and The lowest (least spammy) class is assigned.  In other words, a message must have a score below a class threshold value to be assigned to that class.
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
                score: scoreElement.value,
            };
            if (level.score === "infinite") {
                level.score = 999;
            } else {
                level.score = parseFloat(level.score);
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
        console.log("table change:", event);
        await updateControlState();
    } catch (e) {
        console.error(e);
    }
}

async function onCellDelete(event) {
    try {
        console.log("cell delete");
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        var levels = getLevels();
        levels.splice(row, 1);
        await requests.sendMessage(port, { id: "setClasses", accountId: accountId(), levels: levels });
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function onSliderMoved(event) {
    try {
        console.log("slider moved");
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        let score = document.getElementById(`level-score-${row}`);
        score.value = event.srcElement.value;
        await updateControlState();
    } catch (e) {
        console.error(e);
    }
}

async function onScoreChanged(event) {
    try {
        console.log("score changed");
        const row = parseInt(event.srcElement.getAttribute("data-row"));
        const slider = document.getElementById(`level-slider-${row}`);
        slider.value = `${event.srcElement.value}`;
        await updateControlState();
    } catch (e) {
        console.error(e);
    }
}

async function onNameChanged() {
    try {
        console.log("name changed");
        await updateControlState();
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
        console.log("cellInsert:", event, row);
        let levels = getLevels();
        let newScore = levels[row].score;
        let nextScore = levels[row + 1].score;
        if (nextScore === 999) {
            newScore += 1;
        } else {
            newScore += (nextScore - newScore) / 2;
        }
        levels.splice(row + 1, 0, { name: newLevelName(levels), score: newScore });
        await requests.sendMessage(port, { id: "setClasses", accountId: accountId(), levels: levels });
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

function appendCell(row, index, id, control, text, disabled) {
    try {
        const cell = document.createElement("td");
        let range = false;
        if (control === "range") {
            control = "input";
            range = true;
        }
        const element = document.createElement(control);
        switch (control) {
            case "input":
                if (range) {
                    element.classList.add("form-range");
                    element.classList.add("flex-fill");
                    element.setAttribute("type", "range");
                    element.setAttribute("min", "-20.0");
                    element.setAttribute("max", "20.0");
                    element.setAttribute("step", ".1");
                    element.value = text;
                } else {
                    element.value = text;
                }
                break;
            case "button":
                element.classList.add("btn");
                element.classList.add("btn-primary");
                element.classList.add("btn-sm");
                element.textContent = text;
                break;
            default:
                element.textContent = text;
                break;
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

async function populateRows(levels) {
    try {
        //console.log("table body:", tableBody.innerHTML);
        console.log("BEGIN populateRows");
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
            appendCell(row, index, "level-name", "input", name, disabled);
            const scoreControl = appendCell(row, index, "level-score", "input", score, disabled);
            const sliderControl = appendCell(row, index, "level-slider", "range", sliderValue, disabled);
            if (!disabled) {
                scoreControl.addEventListener("name", onNameChanged);
                sliderControl.addEventListener("input", onSliderMoved);
                scoreControl.addEventListener("change", onScoreChanged);
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

        await updateControlState();
        console.log("END populateRows");
    } catch (e) {
        console.error(e);
    }
}

async function updateControlState(sendToServer = false) {
    try {
        console.log("BEGIN updateControlState");

        const id = accountId();
        const state = await requests.sendMessage(port, {
            id: sendToServer ? "sendClasses" : "setClasses",
            accountId: id,
            levels: getLevels(),
            name: accountNames[id],
        });

        console.log("updateControlState:", state);

        controls.changedCheckbox.checked = state.dirty;
        controls.changedSpan.innerText = state.dirty ? "Changed" : "Unchanged";

        controls.statusSpan.innerText = " " + (state.valid ? "Validated" : "Validation Failed: " + state.message);
        controls.applyButton.disabled = !state.valid;
        controls.accountSelect.disabled = !state.valid;
        controls.okButton.disabled = !state.valid;

        console.log("END updateControlState");
    } catch (e) {
        console.error(e);
    }
}

async function saveChanges() {
    try {
        await updateControlState(true);
    } catch (e) {
        console.error(e);
    }
}

async function onApply() {
    try {
        const attr = document.documentElement.getAttribute("data-bss-forced-theme");
        console.log("attr:", attr);
        console.log("themeSwitcher:", controls.themeSwitcher);
        //await saveChanges();
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
        await saveChanges();
        window.close();
    } catch (e) {
        console.error(e);
    }
}

async function onDefaults() {
    try {
        const levels = await requests.sendMessage(port, { id: "setDefaultLevels", accountId: accountId() });
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function onRefresh() {
    try {
        await sendComposePosition();
        const levels = await requests.sendMessage(port, "refreshAll");
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

async function populateAccountSelect() {
    try {
        console.log("BEGIN populateAccountSelect");
        const accounts = await requests.sendMessage(port, "getAccounts");
        const currentAccountId = await requests.sendMessage(port, "getCurrentAccountId");
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
        await setSelectedAccount(currentAccountId);
        console.log("END populateAccountSelect");
    } catch (e) {
        console.error(e);
    }
}

async function setSelectedAccount(id) {
    try {
        controls.accountSelect.selectedIndex = accountIndex[id];
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
        await populateRows(levels);
    } catch (e) {
        console.error(e);
    }
}

var hasLoaded = false;

async function sendComposePosition() {
    try {
        const message = {
            id: "setComposePosition",
            position: {
                top: Math.floor(window.mozInnerScreenY),
                left: Math.floor(window.mozInnerScreenX),
                height: Math.floor(window.innerHeight),
                width: Math.floor(window.innerWidth),
            },
        };
        await requests.sendMessage(port, message);
    } catch (e) {
        console.error(e);
    }
}

async function handleLoad() {
    try {
        console.log("onLoad BEGIN");

        if (hasLoaded) {
            throw new Error("redundant load event");
        }
        hasLoaded = true;

        await connectToBackground();

        controls.helpText.innerHTML = helpContent;

        await populateAccountSelect();

        const levels = await getClasses(accountId());
        await populateRows(levels);

        console.log("onLoad END");
    } catch (e) {
        console.error(e);
    }
}

async function getClasses(accountId) {
    try {
        await sendComposePosition();
        return await requests.sendMessage(port, { id: "getClasses", accountId: accountId });
    } catch (e) {
        console.error(e);
    }
}

async function onHelp(event) {
    try {
        let button = event.srcElement;
        //console.log("help:", event, button.classList);
        if (button.classList.contains("collapsed")) {
            button.text = "Show Help";
        } else {
            button.text = "Hide Help";
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleUnload() {
    try {
        port.disconnect();
        ports.remove(port);
        port = null;
    } catch (e) {
        console.error(e);
    }
}

async function handleSelectAccount(message) {
    try {
        console.log("selectAccount:", message);
        if (!controls.accountSelect.disabled) {
            await setSelectedAccount(message.accountId);
        }
        return accountId();
    } catch (e) {
        console.error(e);
    }
}

requests.addHandler("selectAccount", handleSelectAccount);

async function handleMessage(message, sender) {
    try {
        console.log("editor received:", message);
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
        }
    } catch (e) {
        console.error(e);
    }
}

async function connectToBackground() {
    try {
        console.log("connectToBackground");
        const background = await browser.runtime.getBackgroundPage();
        console.log("background:", background);
        port = await browser.runtime.connect({ name: "editor" });
        ports.add("editor");
        port.onMessage.addListener(handleMessage);
        //port.postMessage({ id: "ping", src: "editor" });
    } catch (e) {
        console.error(e);
    }
}

function addControl(name, elementId, eventName = null, handler = null) {
    try {
        var element = document.getElementById(elementId);
        controls[name] = element;
        if (eventName) {
            element.addEventListener(eventName, handler);
        }
    } catch (e) {
        console.error(e);
    }
}

addControl("applyButton", "apply-button", "click", onApply);
addControl("okButton", "ok-button", "click", onOk);
addControl("cancelButton", "cancel-button", "click", onCancel);
addControl("defaultsButton", "defaults-button", "click", onDefaults);
addControl("refreshButton", "refresh-button", "click", onRefresh);
addControl("helpButton", "help-button", "click", onHelp);
addControl("accountSelect", "account-select", "change", onAccountSelectChange);
addControl("tableBody", "level-table-body");
addControl("changedCheckbox", "status-changed-checkbox");
addControl("changedSpan", "status-changed-span");
addControl("statusSpan", "status-message-span");
addControl("applyButton", "apply-button");
addControl("helpText", "help-text");
addControl("tableGridRow", "table-grid-row");
addControl("tableGridColumn", "table-grid-column");
addControl("classTable", "class-table", "change", onTableChange);
addControl("themeSwitcher", "theme-switcher");

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);
