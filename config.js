import { differ } from "./common.js";

/* globals console, messenger */

const verbose = false;
const readback = true;

const DEFAULTS = {
    editorTitle: "Mail Filter Control",
    optInApproved: false,
    advancedTabVisible: false,
    autoDelete: true,
    autoOpen: false,
    autoClearConsole: true,
    minimizeCompose: true,
    preferredTheme: "auto",
    domain: {
        "rstms.net": true,
        "bootnotice.com": true,
        "cypress-trading.com": false,
        "citybestmanagement.com": false,
        "fnord.org": true,
    },
};

class ConfigBase {
    constructor(storage, name) {
        this.storage = storage;
        this.name = name;
    }

    async reset() {
        try {
            const current = await this.storage.get();
            var result = "(already empty)";
            if (Object.keys(current).length !== 0) {
                await this.storage.clear();
                result = "cleared";
            }

            if (readback) {
                const readbackValues = await this.storage.get();
                if (Object.keys(readbackValues).length !== 0) {
                    throw new Error("reset readback failed:", readbackValues);
                }
            }

            if (verbose) {
                console.debug("reset:", this.name, result);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async get(key = undefined, useDefaults = true) {
        try {
            if (verbose) {
                console.debug("get:", this.name, key);
            }
            var value = undefined;
            if (key === undefined || key === null) {
                value = await this.storage.get();
                if (this.name == "local" && useDefaults) {
                    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
                        if (value[key] === undefined) {
                            value[key] = defaultValue;
                        }
                    }
                }
            } else {
                const values = await this.storage.get([key]);
                value = values[key];
                if (this.name === "local" && useDefaults) {
                    if (value === undefined) {
                        // storage had no value, try default value
                        value = DEFAULTS[key];
                    }
                }
            }

            if (verbose) {
                console.debug("get returning:", this.name, value);
            }
            return value;
        } catch (e) {
            console.error(e);
        }
    }

    async set(key, value) {
        try {
            if (verbose) {
                console.debug("set:", this.name, key, value);
            }

            const update = {};
            update[key] = value;
            await this.storage.set(update);

            if (readback) {
                const updated = await this.storage.get([key]);
                const readbackValue = updated[key];
                if (differ(value, readbackValue)) {
                    throw new Error("set: readback failed:", value, readbackValue);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    async remove(key) {
        try {
            if (verbose) {
                console.debug("remove:", this.name, key);
            }

            await this.storage.remove([key]);

            if (readback) {
                const updated = await this.storage.get([key]);
                const readbackValue = updated[key];
                if (readbackValue !== undefined) {
                    throw new Error("remove: readback failed:", readbackValue);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}

class ConfigLocal extends ConfigBase {
    constructor() {
        super(messenger.storage.local, "local");
    }
}

class ConfigSession extends ConfigBase {
    constructor() {
        super(messenger.storage.session, "session");
    }
}

export const config = {
    local: new ConfigLocal(),
    session: new ConfigSession(),
    menu: {
        editor: {
            text: "Mail Filter Controls",
            id: "rstms_filter_controls",
        },
        filter: {
            forward: {
                text: "Forward Message To Selected Filter Book",
                id: "rsms_forward_selected",
            },
            select: {
                text: "Select Filter Address Book",
                id: "rstms_filter_select",
            },
            edit: {
                text: "Edit Filter Books",
                id: "rstms_filter_edit",
            },
        },
        addressbook: {
            uri: {
                text: "Paste Filter Book URI",
                id: "rstms_filterbook_uri",
            },
            password: {
                text: "Paste Filter Book password",
                id: "rstms_filterbook_passwd",
            },
        },
    },
};
