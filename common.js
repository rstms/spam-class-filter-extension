/* global console, messenger */

import { config } from "./config.js";

export function generateUUID() {
    try {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0; // Generate a random number between 0 and 15
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); // Convert to hexadecimal
        });
    } catch (e) {
        console.error(e);
    }
}

export function domainPart(text) {
    try {
        if (text === undefined) {
            text = "";
        }
        text = String(text);
        return text.replace(/^[^@]*@*/, "");
    } catch (e) {
        console.error(e);
    }
}

export function differ(original, current) {
    try {
        if (original === current) {
            return false;
        }
        if (original == null || current == null || typeof original !== "object" || typeof current !== "object") {
            return true;
        }

        const originalKeys = Object.keys(original);
        const currentKeys = Object.keys(current);

        if (originalKeys.length !== currentKeys.length) {
            return true;
        }

        for (const key of originalKeys) {
            if (!(key in original)) {
                return true;
            }

            const originalValue = original[key];
            const currentValue = current[key];

            if (Array.isArray(originalValue) && Array.isArray(currentValue)) {
                if (
                    originalValue.length !== currentValue.length ||
                    originalValue.some((item, index) => differ(item, currentValue[index]))
                ) {
                    return true;
                }
            } else if (typeof OriginalValue === "object" || typeof currentValue === "object") {
                if (differ(originalValue, currentValue)) {
                    return true;
                }
            } else if (originalValue !== currentValue) {
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error(e);
    }
}

export async function findEditorTab() {
    try {
        const tabs = await messenger.tabs.query({ type: "content" });
        const editorTitle = await config.local.get("editorTitle");
        for (const tab of tabs) {
            if (tab.title === editorTitle) {
                return tab;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
    }
}

export async function reloadExtension() {
    try {
        const autoOpen = await config.local.get("autoOpen");
        if (autoOpen !== "always") {
            await config.local.set("autoOpen", "once");
        }
        await messenger.runtime.reload();
    } catch (e) {
        console.error(e);
    }
}

// NOTE: call only from editor.js, classes_tab.js, or books_tab.js
export function selectedAccountId(accountSelect) {
    try {
        const index = accountSelect.selectedIndex;
        const selectedOption = accountSelect.options[index];
        return selectedOption.getAttribute("data-account-id");
    } catch (e) {
        console.error(e);
    }
}
