import * as requests from "./request.js";
import { differ } from "./common.js";

var accountId = null;
var accountNames = null;
const MIN_LEVELS = 2;
const MAX_LEVELS = 16;
var initialSize = null;
var port = null;

var controls = {};

var helpContent = `
<br>
The mail server's spam classifier adds an 'X-Spam-Score' header to each incoming message. This header value is a decimal number generally ranging between -20.0 and +20.0.  
<br><br>
Higher scores indicate more spam characteristics.
<br><br>
After scoring, the rspam-classes filter adds an 'X-Spam-Class' header.  This header's value is set to the name of the class with the lowest threshold that is greater than the message score.  The class names are text that can be easily matched in a filtering rule.
<br><br>
Each message's spam score is compared to the thresholds of each class and The lowest (least spammy) class is assigned.  In other words, a message must have a score below a class threshold value to be assigned to that class.
<br>
`;

async function editedLevels() {
    let levels = [];
    for (let i = 0; true; i++) {
        let nameElement = document.getElementById(`level-name-${i}`);
        if (!nameElement) {
            return levels;
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
        levels.push(level);
    }
}

async function onTableChange(event) {
    console.log("table change");
}

async function onCellDelete(event) {
    console.log("cell delete");
    const row = parseInt(event.srcElement.getAttribute("data-row"));
    //let levels = await requests.sendMessage(port, { id: "getClasses", accountId: accountId, responseKey: "levels" });
    let levels = await editedLevels();
    levels.splice(row, 1);
    await requests.sendMessage(port, { id: "setClasses", accountId: accountId, levels: levels });
    await populateRows();
}

async function onSliderMoved(event) {
    console.log("slider moved");
    const row = parseInt(event.srcElement.getAttribute("data-row"));
    let score = document.getElementById(`level-score-${row}`);
    score.value = event.srcElement.value;
    await updateControlState();
}

async function onScoreChanged(event) {
    console.log("score changed");
    const row = parseInt(event.srcElement.getAttribute("data-row"));
    const slider = document.getElementById(`level-slider-${row}`);
    slider.value = `${event.srcElement.value}`;
    await updateControlState();
}

async function onNameChanged(event) {
    console.log("name changed");
    await updateControlState();
}

function newLevelName(levels) {
    for (let i = 1; true; i += 1) {
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
    }
}

async function onCellInsert(event) {
    console.log("cellInsert:", event, row);
    const row = parseInt(event.srcElement.getAttribute("data-row"));
    //let levels = await requests.sendMessage(port, { id: "getClasses", accountId: accountId, responseKey: "levels" });
    let levels = await editedLevels();
    let newScore = levels[row].score;
    let nextScore = levels[row + 1].score;
    if (nextScore === 999) {
        newScore += 1;
    } else {
        newScore += (nextScore - newScore) / 2;
    }
    levels.splice(row + 1, 0, { name: newLevelName(levels), score: newScore });
    await requests.sendMessage(port, { id: "setClasses", accountId: accountId, levels: levels });
    await populateRows();
}

async function resizeWindow() {
    console.log("sending resizeEditorWindow");
    await requests.sendMessage(port, {
        id: "resizeEditorWindow",
        height: initialSize.height,
        width: initialSize.width,
    });
}

function appendCell(row, index, id, control, text, disabled) {
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
}

async function populateRows() {
    //console.log("table body:", tableBody.innerHTML);
    controls.tableBody.innerHTML = "";
    var index = 0;
    //console.log("accountId:", accountId);
    const levels = await requests.sendMessage(port, { id: "getClasses", accountId: accountId, responseKey: "levels" });
    //kconsole.log("levels:", levels);
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
    await updateControlState();
}

async function updateControlState() {
    const levels = await editedLevels();

    /*
    const classLevels = await requests.sendMessage(port, { id: "getClasses", accountId: accountId, responseKey: "levels" });
    console.log("accountId:", accountId);
    console.log("elementLevels:", elementLevels);
    console.log("classLevels:", classLevels);
    if (differ(elementLevels, classLevels)) {
        console.log("element levels differ from class levels");
    }
    */

    const state = await requests.sendMessage(port, {
        id: "updateClasses",
        accountId: accountId,
        levels: levels,
        responseKey: "state",
    });

    contols.changedCheckbox.checked = state.dirty;
    controls.changedSpan.innerText = state.dirty ? "Changed" : "Unchanged";

    controls.statusSpan.innerText = " " + state.valid ? "Valid Classes" : "Validation Failed: " + state.message;
    controls.applyButton.enabled = state.valid;
    controls.accountSelect.enabled = state.valid;
}

async function onApply(event) {
    //await resizeWindow();
}

async function onCancel(event) {
    window.close();
}

async function onOk(event) {
    window.close();
}

async function onDefaults(event) {
    await requests.sendMessage(port, { id: "setDefaultLevels", accountId: accountId });
    await populateRows();
}

async function onRefresh(event) {
    await requests.sendMessage(port, { id: "refreshAll" });
    await populateRows();
}

async function populateAccountSelect() {
    const accounts = await requests.sendMessage(port, { id: "getAccounts", responseKey: "accounts" });
    controls.accountSelect.innerHTML = "";
    accountNames = {};
    var i = 0;
    for (let id of Object.keys(accounts)) {
        const option = document.createElement("option");
        option.setAttribute("data-accountId", id);
        accountNames[id] = accounts[id].name;
        option.textContent = accounts[id].name;
        controls.accountSelect.appendChild(option);
        i++;
    }
}

async function onAccountSelectChange() {
    console.log("account select changed");
}

async function selectAccount() {
    accountId = await requests.sendMessage(port, { id: "getCurrentAccountId", responseKey: "accountId" });
    controls.accountSelect.value = accountNames[accountId];
    await populateRows();
}

async function handleLoad() {
    console.log("onLoad BEGIN");
    accountId = await requests.sendMessage(port, { id: "getCurrentAccountId", responseKey: "accountId" });
    if (!accountNames) {
        controls.helpText.innerHTML = helpContent;
        await populateAccountSelect();
        let style = controls.tableDiv.style;
        /*
	console.log("level-table-div:", tableDiv);
        console.log("level-table-div scrollHeight:", tableDiv.scrollHeight);
        console.log("level-table-div clientHeight:", tableDiv.clientHeight);
        console.log("level-table-div scrollTopMax:", tableDiv.scrollTopMax);
	*/
        const height = controls.tableDiv.clientHeight + 2;
        style["min-height"] = `${height}px`;
        style["max-height"] = `${height}px`;
        style["overflow-y"] = "auto";
        //console.log("level-table-div style:", style);
        await selectAccount();

        if (!initialSize) {
            initialSize = {
                height: document.body.scrollHeight + (window.outerHeight - window.innerHeight),
                width: document.body.scrollWidth + (window.outerWidth - window.innerWidth),
            };
            requests.sendMessage(port, { id: "editorWindowLoaded", height: initialSize.height, width: initialSize.width });
        }
    }
    console.log("onLoad END");
}

async function onHelp(event) {
    let button = event.srcElement;
    //console.log("help:", event, button.classList);
    if (button.classList.contains("collapsed")) {
        button.text = "Show Help";
    } else {
        button.text = "Hide Help";
    }
}

async function handleUnload(event) {
    port.postMessage({
        id: "saveWindowPosition",
        name: "editor",
        width: window.outerWidth,
        height: window.outerHeight,
        left: window.screenX,
        top: window.screenY,
    });
}

async function handleMessage(message, sender) {
    console.log("editor port received:", sender.name, message);
    try {
        if (!requests.resolveResponse(message)) {
            switch (message.id) {
                case "selectAccount":
                    await selectAccount();
                    requests.respond(sender, message);
                    break;
                case "ping":
                    sender.postMessage({ id: "pong", src: "editor" });
                    break;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function connectToBackground() {
    try {
        port = await browser.runtime.connect({ name: "editor" });
        port.onMessage.addListener(handleMessage);
        //port.postMessage({ id: "ping", src: "editor" });
    } catch (e) {
        console.error(e);
    }
}

function addControl(name, elementId, eventName = null, handler = null) {
    var element = document.getElementById(elementId);
    controls[name] = element;
    if (eventName) {
        element.addEventListener(eventName, handler);
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
addControl("tableDiv", "level-table-div");
addControl("classTable", "class-table", "change", onTableChange);

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);

connectToBackground();
