import * as accounts from "./accounts.js";
import { getClasses } from "./classes.js";
import * as config from "./config.js";
import * as requests from "./request.js";

async function onCellDelete(event) {
    console.log("cellDelete:", event);
}

async function onCellInsert(event) {
    console.log("cellInsert:", event);
}

async function resizeWindow() {
    const tableBody = document.getElementById("level-table-body");
    await requests.sendMessage(channel, {
        id: "resizeEditorWindow",
        width: tableBody.scrollWidth + 60,
        height: document.body.scrollHeight + 60,
    });
}

function appendCell(row, index, id, control, text, disabled) {
    const cell = document.createElement("td");
    const element = document.createElement(control);
    if (control === "input") {
        element.value = text;
    } else {
        element.textContent = text;
    }
    element.id = id + "-" + index;
    element.setAttribute("data-row", index);
    element.classList.add("browser-style");
    if (disabled) {
        element.disabled = true;
    }
    cell.appendChild(element);
    row.appendChild(cell);
    return element;
}

async function populateRows() {
    const tableBody = document.getElementById("level-table-body");
    tableBody.innerHTML = "";
    var index = 0;
    const accountId = await accounts.currentId();
    const classes = await getClasses(accountId);
    for (const level of classes) {
        const row = document.createElement("tr");
        let disabled = index === classes.length - 1;
        appendCell(row, index, "level-name", "input", level.name, disabled);
        appendCell(row, index, "level-value", "input", level.score, disabled);
        const deleteButton = appendCell(row, index, "level-delete", "button", "delete", disabled);
        if (!disabled) {
            deleteButton.addEventListener("click", onCellDelete);
        }
        const insertButton = appendCell(row, index, "level-insert", "button", "+", disabled);
        if (!disabled) {
            insertButton.addEventListener("click", onCellInsert);
        }
        tableBody.appendChild(row);
        index = index + 1;
    }
    //await applyTheme();
}

async function onApply(event) {
    const request = { id: "getSystemTheme", responseKey: "systemTheme" };
    console.log("editor sending request:", request);
    const result = await requests.sendMessage(channel, request);
    console.log("editor result:", result);
}

async function onCancel(event) {
    window.close();
}

async function onOk(event) {
    window.close();
}

async function onAddRow(event) {
    console.log("add row clicked");
    await resizeWindow();
}

// apply current theme colors
async function applyTheme() {
    const browserTheme = await browser.theme.getCurrent();
    console.log("browserTheme:", browserTheme);
    const theme = await config.get("systemTheme", config.SESSION);
    console.log("theme:", theme);

    /*
    const backgroundColor = theme.colors.popup || "#ffffff"; // Default to white
    const textColor = theme.colors.popup_text || "#000000"; // Default to black
    const buttonColor = theme.colors.button || "#007acc"; // Default button color
    const buttonTextColor = theme.colors.button_color || "#ffffff"; // Default button text color

    // Set body background color
    document.body.style.backgroundColor = browserTheme.colors.popup || "#ffffff";
    document.body.style.color = browserTheme.colors.popup_text || "#000000";

    // Apply styles to buttons
    const buttons = document.querySelectorAll("button");

    for (const button of buttons) {
        //button.style.fontFamily = theme.button.fontFamily;
        //button.style.fontSize = theme.button.fontSize;
        //button.style.fontWeight = theme.button.fontWeight;
        button.style.color = browserTheme.colors.popup_text;
        button.style.backgroundColor = browserTheme.colors.button; // "#ff0000"; //theme.button.backgroundColor;
        button.style.margin = theme.button.margin;
        button.style.padding = theme.button.padding;
        //button.style.border = theme.button.border;
        button.style.borderRadius = theme.button.borderRadius;
    }

    const inputs = document.querySelectorAll("input");
    for (const input of inputs) {
        input.style.color = browserTheme.colors.input_color;
        input.style.backgroundColor = browserTheme.colors.input_background;
        input.style.border = browserTheme.colors.input_border;
    }
    */
}

var accountIndex = null;

async function initAccountSelect() {
    if (accountIndex) {
        return;
    }
    await config.remove("");
    const accts = await accounts.all();
    console.log("accounts", accts);
    const select = document.getElementById("account-select");
    accountIndex = {};
    select.innerHTML = "";
    var i = 0;
    for (let id of Object.keys(accts)) {
        accountIndex[i] = id;
        accountIndex[id] = i;
        const option = document.createElement("option");
        option.value = i;
        option.textContent = accts[id].name;
        select.appendChild(option);
        i++;
    }
}

async function selectAccount() {
    const accountId = await accounts.currentId();
    await getClasses(accountId);
    const select = document.getElementById("account-select");
    select.value = accountIndex[accountId];
    await populateRows();
}

async function handleLoad() {
    console.log("onLoad");
    document.getElementById("apply-button").addEventListener("click", onApply);
    document.getElementById("ok-button").addEventListener("click", onOk);
    document.getElementById("cancel-button").addEventListener("click", onCancel);
    document.getElementById("add-row-button").addEventListener("click", onAddRow);
    await initAccountSelect();
    await selectAccount();
}

async function handleUnload(event) {
    await config.windowPosition.set("editor", {
        width: window.outerWidth,
        height: window.outerHeight,
        left: window.screenX,
        top: window.screenY,
    });
}

window.addEventListener("load", handleLoad);
window.addEventListener("beforeunload", handleUnload);

var channel = null;

async function handleMessage(message, sender) {
    console.log("editor port received:", sender.name, message);
    try {
        if (!requests.resolveResponse(message)) {
            switch (message.id) {
                case "ping":
                    sender.postMessage({ id: "pong", src: "editor" });
                    break;
                case "howdy":
                    requests.respond(sender, message, { text: "hello yourself" });
                    break;
                case "selectAccount":
                    await selectAccount();
                    requests.respond(sender, message);
                    break;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function connectToBackground() {
    try {
        const port = await browser.runtime.connect({ name: "editor" });
        channel = port;
        port.onMessage.addListener(handleMessage);
        //port.postMessage({ id: "ping", src: "editor" });
    } catch (e) {
        console.error(e);
    }
}

connectToBackground();
