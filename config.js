import { differ, generateUUID } from "./common.js";

const STORAGE_UPDATE_TIMEOUT = 3000;

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
    },
};

const DEFAULT_WINDOW_POS = {
    editor: {
        width: 594,
        height: 568,
    },
};

class ConfigBase {
    constructor(storage, name) {
        this.storage = storage;
        this.name = name;
    }

    async reset() {
        try {
            console.log("config clearing:", this.name);
            const current = await this.storage.get();
            var result = "(already empty)";
            if (Object.keys(current).length !== 0) {
                result = await this.storageSync("clear");
            }
            console.log("config clear result:", this.name, result);
        } catch (e) {
            console.error(e);
        }
    }

    async get(key) {
        try {
            console.log("get:", this.name, key);
            var values = await this.storage.get([key]);
            if (this.name === "local" && Object.keys(values).length === 0) {
                values = DEFAULTS;
            }
            const value = values[key];
            console.log("get returning:", this.name, key, value);
            return value;
        } catch (e) {
            console.error(e);
        }
    }

    async set(key, value) {
        try {
            console.log("set:", this.name, key, value);
            const current = {};
            current[key] = await this.get(key);
            const update = {};
            update[key] = value;
            if (!differ(current, update)) {
                return;
            }

            const changes = await this.storageSync("set", update);
            if (Object.keys(changes).length !== 1) {
                throw new Error("unexpected storage change length");
            }
            for (const [changeKey, { newValue, oldValue }] of Object.entries(changes)) {
                const resultFrom = {};
                resultFrom[changeKey] = oldValue;
                if (differ(current, resultFrom)) {
                    console.log("current:", current);
                    console.log("resultFrom:", resultFrom);
                    throw new Error("unexpected storage change from value");
                }
                const resultTo = {};
                resultTo[changeKey] = newValue;
                if (differ(update, resultTo)) {
                    console.log("update:", update);
                    console.log("resultTo:", resultTo);
                    throw new Error("unexpected storage change to value");
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

                console.log("storageSync:", name, op, update);
                var timer = setTimeout(() => {
                    throw new Error("storage update timeout");
                }, STORAGE_UPDATE_TIMEOUT);

                function handler(changes, areaName) {
                    for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
                        console.log("storage changed:", areaName, key, oldValue, newValue);
                    }
                    browser.storage.onChanged.removeListener(handler);
                    clearTimeout(timer);
                    if (areaName !== name) {
                        throw new Error("unexpected storage change areaName");
                    }
                    console.log("storageSync resolving:", name, changes);
                    resolve(changes);
                }

                browser.storage.onChanged.addListener(handler);
                switch (op) {
                    case "set":
                        console.log("sync: updating storage:", this.name, update);
                        this.storage.set(update).then(() => {
                            console.log("sync updated storage:", this.name, update);
                            return;
                        });
                        break;
                    case "clear":
                        console.log("sync: clearing storage:", this.name);
                        this.storage.clear().then(() => {
                            console.log("sync: cleared storage:", this.name);
                            return;
                        });
                        break;
                    default:
                        throw new Error("unexpected storage operation: " + op);
                        break;
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

class WindowPosition extends ConfigLocal {
    constructor() {
        super();
    }
    async get(name) {
        try {
            console.log("config.windowPosition.get:", name);
            var ret = {};
            const windowPos = await super.get("windowPos");
            if (windowPos && windowPos[name]) {
                ret = windowPos[name];
            }
            console.log("config.windowPosition.get returning:", name, ret);
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    async set(name, pos) {
        try {
            console.log("config.windowPosition.set:", name, pos);
            var windowPos = await super.get("windowPos");
            if (!windowPos) {
                windowPos = {};
            }
            windowPos[name] = pos;
            await super.set("windowPos", windowPos);
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
