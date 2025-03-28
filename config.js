import { differ } from "./common.js";

/* globals console, messenger */

const verbose = false;
const readback = true;

const READBACK_TRIES = 5;

const DEFAULTS = {
    editorTitle: "Mail Filter Control",
    optInApproved: true,
    advancedTabVisible: false,
    autoDelete: true,
    autoOpen: true,
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
        this.locked = false;
        this.waiting = [];
    }

    async lock() {
        try {
            while (this.locked) {
                await new Promise((resolve) => this.waiting.push(resolve));
            }
            this.locked = true;
        } catch (e) {
            console.error(e);
        }
    }

    unlock() {
        try {
            this.locked = false;
            if (this.waiting.length > 0) {
                const next = this.waiting.shift();
                next();
            }
        } catch (e) {
            console.error(e);
        }
    }

    async reset() {
        try {
            await this.lock();
            const current = await this.storage.get();
            var result = "(already empty)";
            if (Object.keys(current).length !== 0) {
                await this.storage.clear();
                result = "cleared";
            }
            await this.checkReadback("reset", undefined, undefined);
            if (verbose) {
                console.debug("reset:", this.name, result);
            }
        } catch (e) {
            console.error(e);
        } finally {
            this.unlock();
        }
    }

    async get(key = undefined, useDefaults = true) {
        try {
            await this.lock();
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
        } finally {
            this.unlock();
        }
    }

    async checkReadback(action, key, expected) {
        try {
            if (verbose) {
                console.debug("checkReadback:", action, key, expected);
            }
            if (!readback) {
                console.debug("readback disabled");
                return;
            }

            for (let i = 0; i < READBACK_TRIES; i++) {
                if (key === undefined) {
                    const readback = await this.storage.get();
                    if (Object.keys(readback).length === 0) {
                        if (verbose) {
                            console.debug("readback success:", action);
                        }
                        return;
                    }
                } else {
                    const updated = await this.storage.get([key]);
                    const readback = updated[key];
                    if (!differ(readback, expected)) {
                        if (verbose) {
                            console.debug("readback success:", action, readback, expected);
                        }
                        return;
                    }
                    console.debug("readback mismatch:", {
                        retry: i + 1,
                        action: action,
                        key: key,
                        expected: expected,
                        readback: readback,
                    });
                }
                console.warn("readback mismatch: try:", i + 1);
            }
            throw new Error("config readback failed");
        } catch (e) {
            console.error(e);
        }
    }

    async set(key, value) {
        try {
            await this.lock();
            if (verbose) {
                console.debug("set:", this.name, key, value);
            }
            const update = {};
            update[key] = value;
            await this.storage.set(update);
            await this.checkReadback("set", key, value);
        } catch (e) {
            console.error(e);
        } finally {
            this.unlock();
        }
    }

    async remove(key) {
        try {
            await this.lock();
            if (verbose) {
                console.debug("remove:", this.name, key);
            }
            await this.storage.remove([key]);
            await this.checkReadback("remove", key, undefined);
        } catch (e) {
            console.error(e);
        } finally {
            this.unlock();
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
};
