import { differ } from "./common.js";

/* globals console, browser, setTimeout, clearTimeout */

const STORAGE_UPDATE_TIMEOUT = 3000;
const verbose = false;

const DEFAULTS = {
    use_email_interface: true,
    domain: {
        "rstms.net": true,
        "rstms.com": true,
        "bootnotice.com": true,
        "cypress-trading.com": false,
        "greenbluffllc.com": false,
        "harborstreetventures.com": false,
        "citybestmanagement.com": false,
        "mailcapsule.io": true,
    },
};

class ConfigBase {
    constructor(storage, name) {
        this.storage = storage;
        this.name = name;
    }

    async reset() {
        try {
            if (verbose) {
                console.debug("config clearing:", this.name);
            }
            const current = await this.storage.get();
            var result = "(already empty)";
            if (Object.keys(current).length !== 0) {
                result = await this.storageSync("clear");
            }
            if (verbose) {
                console.debug("config clear result:", this.name, result);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async get(key) {
        try {
            if (verbose) {
                console.debug("get:", this.name, key);
            }
            var values = await this.storage.get([key]);
            if (this.name === "local" && Object.keys(values).length === 0) {
                values = DEFAULTS;
            }
            const value = values[key];
            if (verbose) {
                console.debug("get returning:", this.name, key, value);
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
            const current = await this.get(key);
            if (!differ(current, value)) {
                return;
            }
            var update = {};
            update[key] = value;
            const changes = await this.storageSync("set", update);
            if (Object.keys(changes).length !== 1) {
                throw new Error("unexpected storage change length");
            }
            for (const [changeKey, { newValue, oldValue }] of Object.entries(changes)) {
                if (changeKey !== key) {
                    throw new Error("unexpected storage change key");
                }
                if (differ(current, oldValue)) {
                    console.debug("current:", current);
                    console.debug("oldValue:", oldValue);
                    throw new Error("unexpected storage change oldValue");
                }
                if (differ(value, newValue)) {
                    console.debug("value:", value);
                    console.debug("newValue:", newValue);
                    throw new Error("unexpected storage change newValue");
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    storageSync(op, update = null) {
        return new Promise((resolve, reject) => {
            try {
                var name = this.name;

                if (verbose) {
                    console.debug("storageSync:", name, op, update);
                }
                var timer = setTimeout(() => {
                    console.debug("name:", name);
                    console.debug("op:", op);
                    console.debug("update:", update);
                    throw new Error("storage update timeout");
                }, STORAGE_UPDATE_TIMEOUT);

                function handler(changes, areaName) {
                    for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
                        if (verbose) {
                            console.debug("storage changed:", areaName, key, oldValue, newValue);
                        }
                    }
                    browser.storage.onChanged.removeListener(handler);
                    clearTimeout(timer);
                    if (areaName !== name) {
                        throw new Error("unexpected storage change areaName");
                    }
                    if (verbose) {
                        console.debug("storageSync resolving:", name, changes);
                    }
                    resolve(changes);
                }

                browser.storage.onChanged.addListener(handler);
                switch (op) {
                    case "set":
                        if (verbose) {
                            console.debug("sync: updating storage:", this.name, update);
                        }
                        this.storage.set(update).then(() => {
                            if (verbose) {
                                console.debug("sync updated storage:", this.name, update);
                            }
                            return;
                        });
                        break;
                    case "clear":
                        if (verbose) {
                            console.debug("sync: clearing storage:", this.name);
                        }
                        this.storage.clear().then(() => {
                            if (verbose) {
                                console.debug("sync: cleared storage:", this.name);
                            }
                            return;
                        });
                        break;
                    default:
                        throw new Error("unexpected storage operation: " + op);
                }
            } catch (e) {
                reject(e);
            }
        });
    }
}

class ConfigLocal extends ConfigBase {
    constructor() {
        super(browser.storage.local, "local");
    }
}

class ConfigSession extends ConfigBase {
    constructor() {
        super(browser.storage.session, "session");
    }
}

class WindowPosition {
    constructor() {
        this.config = new ConfigLocal();
    }

    addValues(pos, newPos) {
        try {
            if (typeof newPos !== "object") {
                return pos;
            }
            for (const [key, value] of Object.entries(newPos)) {
                switch (key) {
                    case "top":
                    case "left":
                    case "height":
                    case "width":
                        pos[key] = value;
                }
            }
            return pos;
        } catch (e) {
            console.error(e);
        }
    }

    async get(name, defaults = undefined) {
        try {
            if (verbose) {
                console.debug("config.windowPosition.get:", name);
            }
            var pos = this.addValues({}, defaults);
            const windowPos = await this.config.get("windowPos");
            if (typeof windowPos === "object") {
                pos = this.addValues(pos, windowPos[name]);
            }
            if (verbose) {
                console.debug("config.windowPosition.get returning:", name, pos);
            }
            return pos;
        } catch (e) {
            console.error(e);
        }
    }

    async set(name, pos) {
        try {
            if (verbose) {
                console.debug("config.windowPosition.set:", name, pos);
            }
            var windowPos = await this.config.get("windowPos");
            if (!windowPos) {
                windowPos = {};
            }
            windowPos[name] = this.addValues({}, pos);
            await this.config.set("windowPos", windowPos);
        } catch (e) {
            console.error(e);
        }
    }
}

export const config = {
    local: new ConfigLocal(),
    session: new ConfigSession(),
    windowPosition: new WindowPosition(),
};
