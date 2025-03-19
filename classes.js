import { sendEmailRequest } from "./email.js";
import { differ } from "./common.js";

const MIN_SCORE = -100.0;
const MAX_SCORE = 100.0;
const verbose = false;
const CLASSES = "classes";
const BOOKS = "books";

/* global console */

export class FilterData {
    constructor(state, accounts, type, defaultItems, editorTab) {
        this.msg = {};
        this.type = type;
        this.emailRequestTimeout = undefined;
        this.editorTab = editorTab;
        this.defaultItems = defaultItems;
        switch (this.type) {
            case CLASSES:
                this.msg.notFound = "Class not present";
                this.msg.updateOk = "Classes updated successfully";
                this.msg.updateFail = "Failed to update all changed classes";
                this.msg.validateFail = "Set classes failed validation:";
                this.requestCommand = "classes";
                this.resultKey = "Classes";
                break;
            case BOOKS:
                this.msg.notFound = "Address book not present";
                this.msg.updateOk = "Address book updated successfully";
                this.msg.updateFail = "Failed to update all changed address books";
                this.msg.validateFail = "Set address books failed validation:";
                this.requestCommand = "dump";
                this.resultKey = "Books";
                break;
            default:
                throw new Error("unexpected type:", this.type);
        }

        if (typeof state !== "object") {
            state = {};
        }

        if (!("classes" in state)) {
            state.classes = {
                dirty: {},
                server: {},
            };
        }

        this.classes = state.classes;
        this.accounts = accounts;
    }

    state() {
        return {
            classes: this.classes,
        };
    }

    all() {
        try {
            var classes = {};
            for (const [id, items] of Object.entries(this.classes.server)) {
                classes[id] = items;
            }
            for (const [id, items] of Object.entries(this.classes.dirty)) {
                classes[id] = items;
            }
            return classes;
        } catch (e) {
            console.error(e);
        }
    }

    items(account) {
        try {
            var classes = this.all();
            const ret = classes[account.id];
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    isDirty(account) {
        try {
            if (!(account.id in this.classes.server)) {
                throw new Error(this.msg.notFound);
            }
            if (!(account.id in this.classes.dirty)) {
                return false;
            }
            const dirty = differ(this.classes.dirty[account.id], this.classes.server[account.id]);
            if (!dirty) {
                delete this.classes.dirty[account.id];
            }
            return dirty;
        } catch (e) {
            console.error(e);
        }
    }

    async get(account, force = false) {
        try {
            var items = this.items(account);
            if (force || !Array.isArray(items) || items.length === 0) {
                const result = await sendEmailRequest(account, this.requestCommand, "", this.emailRequestTimeout, this.editorTab);
                if (verbose) {
                    console.log(this.requestCommand + " result", result);
                }
                if (!result) {
                    return { items: null, valid: false, message: this.requestCommand + " request failed; please contact support" };
                }
                const returned = result[this.resultKey];
                const validated = this.validateItems(returned);
                if (validated.error) {
                    console.warn("server " + this.requestCommand + " response failed validation:", validated.error, returned);
                }
                delete this.classes.dirty[account.id];
                this.classes.server[account.id] = validated.items;
                items = validated.items;
            }
            return items;
        } catch (e) {
            console.error(e);
        }
    }

    setItems(account, items) {
        try {
            if (!differ(items, this.classes.server[account.id])) {
                delete this.classes.dirty[account.id];
            } else {
                this.classes.dirty[account.id] = items;
            }
        } catch (e) {
            console.error(e);
        }
    }

    async set(account, items) {
        try {
            const validated = this.validateItems(items);
            if (validated.error) {
                console.warn(this.msg.validateFail, validated.error, items);
            }
            this.setItems(account, validated.items);
            return this.validate(account);
        } catch (e) {
            console.error(e);
        }
    }

    async setDefaultItems(account) {
        try {
            await this.set(account, this.defaultItems);
            return this.defaultItems;
        } catch (e) {
            console.error(e);
        }
    }

    async sendAll(accounts, force = false) {
        try {
            var classes = this.all();
            let ret = {
                success: true,
                error: false,
                message: this.msg.updateOk,
            };

            for (const id of Object.keys(classes)) {
                const result = await this.send(accounts[id], force);
                if (result.error) {
                    ret = {
                        success: false,
                        error: true,
                        message: this.msg.updateFail,
                    };
                }
            }
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    validate(account, items = undefined) {
        try {
            if (items === undefined) {
                items = this.items(account);
            }
            let ret = {
                dirty: this.isDirty(account),
                items: items,
                message: "",
            };

            const validated = this.validateItems(ret.items);
            if (validated.error) {
                ret.message = validated.error;
                ret.valid = false;
            } else {
                ret.items = validated.items;
                this.setItems(account, validated.items);
                ret.valid = true;
            }
            return ret;
        } catch (e) {
            console.error(e);
        }
    }
}

export class FilterClasses extends FilterData {
    constructor(state, accounts, editorTab) {
        const defaultItems = [
            {
                name: "ham",
                score: "0",
            },
            {
                name: "possible",
                score: "5",
            },
            {
                name: "spam",
                score: "999",
            },
        ];
        super(state, accounts, CLASSES, defaultItems, editorTab);
    }

    async send(account, force) {
        try {
            const items = this.items(account);
            if (items !== undefined) {
                const validated = this.validate(account);
                if (!validated.valid) {
                    throw new Error(`Validation failed: ${validated.message}`);
                }
                if (force || validated.dirty) {
                    var values = [];
                    for (const level of validated.items) {
                        values.push(`${level.name}=${level.score}`);
                    }
                    const subject = "reset " + values.join(" ");
                    const result = await sendEmailRequest(account, subject, "", this.emailRequestTimeout, this.editorTab);
                    if (verbose) {
                        console.log("result", result);
                    }
                    const returned = result.Classes;
                    if (verbose) {
                        console.log("returned classes", returned);
                    }
                    const validatedReturn = this.validateItems(returned);
                    if (validatedReturn.error) {
                        console.debug("account:", account);
                        console.debug("returned:", returned);
                        console.error("failure: reset result failed validation:", validatedReturn.error);
                        throw new Error(`send result failed validation: ${validatedReturn.error}`);
                    }
                    if (differ(validated.items, validatedReturn.items)) {
                        console.debug("account:", account);
                        console.debug("validated.items:", returned);
                        console.debug("validatedReturn.items:", validatedReturn.items);
                        throw new Error("send result failed: readback mismatch");
                    }
                    delete this.classes.dirty[account.id];
                    this.classes.server[account.id] = validated.items;
                    return { success: true, error: false, message: "classes sent successfully" };
                }
            }
            return { success: true, error: false, message: "classes unchanged" };
        } catch (e) {
            console.error(e);
            return { success: false, error: true, message: `${e}` };
        }
    }

    validateItems(items) {
        try {
            if (!Array.isArray(items)) {
                return { items: items, error: "unexpected data type" };
            }
            if (items.length < 2) {
                return { items: items, error: "not enough items" };
            }
            var validItems = [];
            var lastScore = undefined;
            var classObj = {};
            var scoreObj = {};
            for (const inputLevel of items) {
                const level = { name: inputLevel.name, score: inputLevel.score };
                if (typeof level.name === "string") {
                    level.name = level.name.trim();
                    level.name = level.name.replace(/\s/g, "_");
                } else {
                    return { items: items, error: "unexpected class name type" };
                }

                if (level.name.length === 0) {
                    return { items: items, error: "missing class name" };
                }

                switch (typeof level.score) {
                    case "number":
                        level.score = String(parseFloat(level.score));
                        break;
                    case "string":
                        break;
                    default:
                        return { items: items, error: "unexpected threshold type" };
                }

                level.score = level.score.trim();
                if (level.score.length === 0) {
                    return { items: items, error: "missing threshold value" };
                }

                if (!isFinite(level.score)) {
                    return { items: items, error: "threshold value not a number" };
                }

                if (!/^[a-zA-Z]/.test(level.name)) {
                    return { items: items, error: "class names must start with a letter" };
                }

                if (!/^[a-zA-Z0-9_-]+$/.test(level.name)) {
                    return `illegal characters in class name: '${level.name}'`;
                }

                if (!/^(-|)(([0-9]+(\.|)[0-9]*)|([0-9]*(\.|)[0-9]+))$/.test(level.score)) {
                    return `illegal characters in threshold: '${level.score}'`;
                }

                if (
                    level.name !== "spam" &&
                    (parseFloat(level.score) < parseFloat(MIN_SCORE) || parseFloat(level.score) > parseFloat(MAX_SCORE))
                ) {
                    return `threshold out of range: '${level.score}'`;
                }

                if (lastScore !== undefined && parseFloat(level.score) < lastScore) {
                    return { items: items, error: "thresholds not in ascending order" };
                }

                classObj[level.name] = level.score;
                scoreObj[level.score] = level.name;
                validItems.push({ name: level.name, score: level.score });
                lastScore = parseFloat(level.name);
            }
            if (!("spam" in classObj)) {
                return { items: items, error: "missing spam class" };
            }
            if (classObj["spam"] !== "999") {
                return { items: items, error: "unexpected spam class threshold" };
            }
            if (items.length !== Object.keys(classObj).length) {
                return { items: items, error: "duplicate class name" };
            }
            if (items.length !== Object.keys(scoreObj).length) {
                return { items: items, error: "duplicate threshold value" };
            }

            if (items.length !== validItems.length) {
                return { items: items, error: "validation mismatch" };
            }

            return { items: validItems, error: "" };
        } catch (e) {
            console.error(e);
        }
    }
}

export class FilterBooks extends FilterData {
    constructor(state, accounts, editorTab) {
        super(state, accounts, BOOKS, new Map(), editorTab);
    }

    async send(account, force) {
        try {
            const items = this.items(account);
            if (items !== undefined) {
                const validated = this.validate(account);
                if (!validated.valid) {
                    throw new Error(`Validation failed: ${validated.message}`);
                }
                if (force || validated.dirty) {
                    const username = account.identities[0].email;
                    const command = "restore";
                    const request = { Dump: { Users: {} } };
                    request.Dump.Users[username] = validated.items;
                    if (verbose) {
                        console.log("FilterBooks.send:", { account: account, command: command, request: request });
                    }
                    const result = await sendEmailRequest(account, command, request, this.emailRequestTimeout, this.editorTab);
                    if (verbose) {
                        console.log("result", result);
                    }
                    return { success: false, error: true, message: "FIXME" };
                    /*
		    if (verbose) {
			console.log("returned address books", returned);
		    }
                    const validatedReturn = this.validateItems(returned);
                    if (validatedReturn.error) {
                        console.debug("account:", account);
                        console.debug("returned:", returned);
                        console.error("failure: reset result failed validation:", validatedReturn.error);
                        throw new Error(`reset result validation failed: ${validatedReturn.error}`);
                    }
                    if (differ(validated.items, validatedReturn.items)) {
                        console.debug("account:", account);
                        console.debug("validated.items:", returned);
                        console.debug("validatedReturn.items:", validatedReturn.items);
                        throw new Error("reset result mismatch");
                    }
                    delete this.classes.dirty[account.id];
                    this.classes.server[account.id] = validated.items;
                    return { success: true, error: false, message: "classes sent successfully" };
		    */
                }
            }
            return { success: true, error: false, message: "classes unchanged" };
        } catch (e) {
            console.error(e);
            return { success: false, error: true, message: `${e}` };
        }
    }

    validateItemContainer(items) {
        try {
            if ((!items) instanceof Map) {
                return "unexpected data type: " + typeof items;
            }
            for (const key of items.keys()) {
                if (typeof key !== "string") {
                    return "unexpected book name data type: " + typeof key;
                }
            }
            return null;
        } catch (e) {
            console.error(e);
        }
    }

    validateBookName(bookname) {
        try {
            if (!/^[a-zA-Z][a-zA-Z0-9-]+$/.test(bookname)) {
                return `illegal characters in address book name: '${bookname}'`;
            }
            return null;
        } catch (e) {
            console.error(e);
        }
    }

    validateAddressList(bookname, addresses) {
        try {
            const prefix = "book ' + bookname + ': ";
            if (!Array.isArray(addresses)) {
                return prefix + "unexpected address list data type: " + typeof addresses;
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const emailSet = new Set();
            for (const address in addresses) {
                if (typeof address !== "string") {
                    return prefix + "unexpected address data type: " + typeof address;
                }
                if (emailRegex.test(address)) {
                    return prefix + "incorrectly formatted address: '" + address + "'";
                }
                if (emailSet.has(address)) {
                    return prefix + "duplicate address: '" + address + "'";
                }
                emailSet.add(address);
            }
            return null;
        } catch (e) {
            console.error(e);
        }
    }

    validateItems(items) {
        try {
            var error = this.validateItemContainer(items);
            if (error) {
                return { items: items, error: error };
            }
            for (const [key, value] of items.entries()) {
                error = this.validateBookName(key);
                if (error) {
                    return { items: items, error: error };
                }
                error = this.validateAddressList(value);
                if (error) {
                    return { items: items, error: error };
                }
            }
            return { items: items, error: "" };
        } catch (e) {
            console.error(e);
        }
    }
}
