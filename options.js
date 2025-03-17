/* globals browser, document, console */

const optInCheckboxId = "#opt-in-checkbox";
const optInKey = "optInApproved";

async function saveOptions(e) {
    console.log("opt in clicked");
    const settings = {};
    settings[optInKey] = document.querySelector(optInCheckboxId).checked;
    await browser.storage.local.set(settings);
    e.preventDefault();
}

async function restoreOptions() {
    const settings = await browser.storage.local.get([optInKey]);
    document.querySelector(optInCheckboxId).checked = settings[optInKey] ? true : false;
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector(optInCheckboxId).addEventListener("click", saveOptions);
