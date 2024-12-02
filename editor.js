import { getAccounts, getCurrentAccountId } from "./accounts.js";
import { getClasses } from "./classes.js";
import { getConfig, saveConfig, saveWindowPos } from "./config.js";

async function onCellDelete(event) {
    console.log("cellDelete:", event)
}

function appendCell(row, index, id, control, text) {
	const cell = document.createElement("td");
	const element = document.createElement(control);
	if (control === "input" ) {
	    element.value = text;
	} else {
	    element.textContent = text;
	}
	element.id = id + "-" + index;
	element.setAttribute("data-row", index);
	element.classList.add("browser-style");
	cell.appendChild(element);
	row.appendChild(cell);
	return element;
}

async function populateRows() {
    const tableBody = document.getElementById("level-table-body");
    tableBody.innerHTML = "";
    var index = 0;
    const accountId = await getCurrentAccountId();
    const classes = await getClasses(accountId);

    for (const level of classes ) {
	const row = document.createElement("tr");
	appendCell(row, index, "level-name", "input", level.name);
	appendCell(row, index, "level-value", "input", level.score);
	appendCell(row, index, "level-delete", "button", "delete").addEventListener("click", onCellDelete);
	tableBody.appendChild(row);
	index = index + 1;
    }
    //await applyTheme();
}

async function onApply(event) {
    testo();
    console.log("apply clicked");
}

async function onCancel(event) {
    window.close();
}

async function onOk(event) {
    window.close();
}

async function onAddRow(event) {
    console.log("add row clicked");
}

// apply current theme colors
async function applyTheme() {

    var theme = await browser.theme.getCurrent();
    console.log("theme:", theme);

    const backgroundColor = theme.colors.popup || "#ffffff"; // Default to white
    const textColor = theme.colors.popup_text || "#000000"; // Default to black
    const buttonColor = theme.colors.button_background || "#007acc"; // Default button color
    const buttonTextColor = theme.colors.button_color || "#ffffff"; // Default button text color

    // Set body background color
    document.body.style.backgroundColor = backgroundColor;
    document.body.style.color = textColor;

    // Apply styles to buttons
    const buttons = document.querySelectorAll('button');

    for (const button of buttons) {
        button.style.backgroundColor = buttonColor;
        button.style.color = buttonTextColor;

	// remove border
        button.style.border = 'none'; 

        // rounded corners
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
    }
}

async function selectAccount() {
    const accounts = await getAccounts();
    const accountId = await getCurrentAccountId();
    await getClasses(accountId);
    document.getElementById("account-title").textContent = accounts[accountId].name;
    await populateRows();
}

async function onLoad() {
    console.log("onLoad");
    document.getElementById("apply-button").addEventListener("click", onApply);
    document.getElementById("ok-button").addEventListener("click", onOk);
    document.getElementById("cancel-button").addEventListener("click", onCancel);
    document.getElementById("add-row-button").addEventListener("click", onAddRow);
    await selectAccount();
}

async function onUnload(event) {
    const pos = {
	width: window.outerWidth,
	height: window.outerHeight,
	x: window.screenX,	
	y: window.screenY
    };
    console.log("pos:", pos);
    await saveWindowPos("editor", pos);
}

window.addEventListener("load", onLoad);
window.addEventListener("beforeunload", onUnload);

