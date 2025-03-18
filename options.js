/* globals messenger, document, console */
import { config } from "./config.js";
import { findEditorTab, reloadExtension } from "./common.js";
import { initThemeSwitcher } from "./theme_switcher.js";

const optInCheckboxId = "#opt-in-checkbox";
const openButton = "#options-open-button";
const optInKey = "optInApproved";

initThemeSwitcher();

async function saveOptions(sender) {
    try {
        console.log("opt in clicked:", sender);
        const checked = sender.target.checked;
        await config.local.set(optInKey, checked);
        await enableButton(checked);
        if (!checked) {
            if (await findEditorTab()) {
                reloadExtension();
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function restoreOptions() {
    try {
        var checked = await config.local.get(optInKey);
        checked = checked ? true : false;
        document.querySelector(optInCheckboxId).checked = checked;
        await enableButton(checked);
    } catch (e) {
        console.error(e);
    }
}

async function enableButton(checked) {
    try {
        const button = document.querySelector(openButton);
        button.disabled = checked ? false : true;
    } catch (e) {
        console.error(e);
    }
}

async function openEditor() {
    await messenger.runtime.sendMessage({ id: "focusEditorWindow" });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector(optInCheckboxId).addEventListener("click", saveOptions);
document.querySelector(openButton).addEventListener("click", openEditor);
