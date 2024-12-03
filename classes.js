import { sendEmailRequest } from "./email.js";
import { domainPart } from "./common.js";
import * as config from "./config.js";

async function getSessionClasses() {
    try {
        var classes = await config.get("classes");
        if (typeof classes === "object") {
            return classes;
        }
        return {};
    } catch (e) {
        console.error(e);
    }
}

async function getSessionDirty() {
    try {
        var dirty = await config.get("dirty");
        if (typeof dirty === "object") {
            return dirty;
        }
        return {};
    } catch (e) {
        console.error(e);
    }
}

async function setDirty(accountId, state) {
    try {
        const dirty = await getSessionDirty();
        dirty[accountId] = state;
        await config.set("dirty", dirty);
    } catch (e) {
        console.error(e);
    }
}

async function isDirty(accountId) {
    try {
        const dirty = await getSessionDirty();
        return dirty[accountId];
    } catch (e) {
        console.error(e);
    }
}

// return true if classes differ or false if they are equal
function classesDiffer(original, current) {
    try {
        if (!original) return true;
        if (original.length != current.length) {
            return true;
        }
        for (let i = 0; i < original.length; i++) {
            if (original[i].name != current[i].name) {
                return true;
            }
            if (original[i].score != current[i].score) {
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error(e);
    }
}

export async function getClasses(accountId) {
    try {
        var classes = await getSessionClasses();
        if (!classes[accountId]) {
            const result = await sendEmailRequest(accountId, "list");
            classes[accountId] = result.json.Classes;
            await config.set("classes", classes);
            await setDirty(accountId, false);
        }
        return classes[accountId];
    } catch (e) {
        console.error(e);
    }
}

export async function setClasses(accountId, classes) {
    try {
        var classes = await getSessionClasses();
        const original = classes[accountId];
        classes[accountId] = classes;
        await config.set("classes", classes);
        const wasDirty = await isDirty(accountId);
        if (!wasDirty) {
            await setDirty(accountId, classesDiffer(original, classes));
        }
    } catch (e) {
        console.error(e);
    }
}

export async function saveClasses(accountId = null) {
    try {
        var classes;
        if (accountId) {
            classes = {};
            classes[accountId] = await getClasses(accountId);
        } else {
            classes = await getSessionClasses();
        }
        for (const [accountId, levels] of Object.entries(classes)) {
            const dirty = await isDirty(accountId);
            if (dirty) {
                values = [];
                for (const level of levels) {
                    values.push(level.name + "=" + level.score);
                }
                const subject = "reset " + levels.join(",");
                const result = await sendEmailRequest(accountId, subject);
                console.log("update result:", result);
                await setDirty(accountId, false);
            }
        }
    } catch (e) {
        console.error(e);
    }
}
