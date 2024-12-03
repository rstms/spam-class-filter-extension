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

export const LOCAL = 0;
export const SESSION = 1;

function selectStorage(storage = LOCAL) {
    switch (storage) {
        case SESSION:
            return browser.storage.session;
        case LOCAL:
            return browser.storage.local;
        default:
            throw new Error("unexpected storage index");
    }
}

async function getAll(storage = LOCAL) {
    try {
        var ret = {};
        if (storage === LOCAL) {
            ret = DEFAULTS;
        }
        var values = await selectStorage(storage).get(["config"]);
        if (values && values.config) {
            ret = values.config;
        }
        //console.log("config.getAll returning:", ret);
        return ret;
    } catch (e) {
        console.error(e);
    }
}

async function setAll(values, storage = LOCAL) {
    try {
        await selectStorage(storage).set({ config: values });
    } catch (e) {
        console.error(e);
    }
}

export async function set(key, value = undefined, storage = LOCAL) {
    try {
        var values;
        switch (typeof key) {
            case "string":
                if (typeof value == "undefined") {
                    throw new Error("missing value");
                }
                values = await getAll(storage);
                values[key] = value;
                break;
            case "object":
                if (typeof value != "undefined") {
                    throw new Error("cannot use object as key");
                }
                values = key;
                break;
            default:
                throw new Error("unexpected key type");
                break;
        }
        //console.log("config.set setting:", values);
        await setAll(values, storage);
    } catch (e) {
        console.error(e);
    }
}

export async function get(key = undefined, storage = LOCAL) {
    try {
        var ret = await getAll(storage);
        if (typeof key != "undefined") {
            ret = ret[key];
        }
        return ret;
    } catch (e) {
        console.error(e);
    }
}

export async function remove(key, storage = LOCAL) {
    try {
        var values = await getAll(storage);
        if (values[key]) {
            delete values[key];
            await setAll(values, storage);
        }
    } catch (e) {
        console.error(e);
    }
}

class WindowPosition {
    async get(name, defaultPos) {
        try {
            var ret = defaultPos;
            const windowPos = await get("windowPos");
            if (windowPos && windowPos[name]) {
                ret = windowPos[name];
            }
            //console.log(`getWindowPos[${name}] returning:`, ret);
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    async set(name, pos) {
        try {
            //console.log(`setWindowPos[${name}]:`, pos);
            var windowPos = await get("windowPos");
            if (!windowPos) {
                windowPos = {};
            }
            windowPos[name] = pos;
            await set("windowPos", windowPos);
        } catch (e) {
            console.error(e);
        }
    }
}

export const windowPosition = new WindowPosition();
