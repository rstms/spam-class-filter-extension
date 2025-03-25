import { sendEmailRequest } from "./email.js";
import { differ, accountEmail } from "./common.js";
import { AsyncMap } from "./asyncmap.js";
import { isValidEmailAddress, isValidBookName, deepCopy } from "./common.js";

/* global console */

const verbose = true;

const MIN_SCORE = parseFloat(-100.0);
const MAX_SCORE = parseFloat(100.0);
const SPAM_SCORE = parseFloat(999);

const CLASSES = "classes";
const BOOKS = "books";

let responseCache = new AsyncMap();
let accountPasswords = new AsyncMap();

function isValidScore(score) {
    const stringValue = String(score);
    const parsedValue = parseFloat(stringValue);
    return isFinite(parsedValue) && !isNaN(parsedValue) && parsedValue.toString() === stringValue;
}

function validateLevelName(name) {
    if (typeof name !== "string") {
        throw new Error("class name type not string");
    }
    name = name.trim();
    name = name.replace(/\s/g, "_");
    if (name.length === 0) {
        throw new Error("missing class name");
    }
    if (!/^[a-zA-Z]/.test(name)) {
        throw new Error("class names must start with a letter");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error(`illegal characters in class name: '${name}'`);
    }
    return name;
}

function validateLevelScore(score) {
    if (typeof score !== "number" && typeof score !== "string") {
        throw new Error("score type must be string or number");
    }

    // check score string value
    if (typeof score === "string") {
        score = score.trim();
        if (score.length === 0) {
            throw new Error("missing threshold value");
        }
        if (!/^(-|)(([0-9]+(\.|)[0-9]*)|([0-9]*(\.|)[0-9]+))$/.test(score)) {
            throw new Error(`illegal characters in threshold: '${score}'`);
        }
    }

    if (!isValidScore(score)) {
        throw new Error("illegal score value");
    }
    return parseFloat(score);
}

function validateAccountId(accountId) {
    if (typeof accountId !== "string") {
        throw new Error("accountId type not string");
    }
    if (!accountId) {
        throw new Error("invalid accountId");
    }
    return accountId;
}

function validateEmailAddress(emailAddress) {
    if (!isValidEmailAddress(emailAddress)) {
        throw new Error("emailAddress is not a valid email address string");
    }
    return emailAddress;
}

function validateBookName(bookName) {
    if (typeof bookName !== "string") {
        throw new Error("book name type not string");
    }
    if (!isValidBookName(bookName)) {
        throw new Error("invalid book name");
    }
    return bookName;
}

export class Level {
    constructor(name, score) {
        try {
            this.name = validateLevelName(name);
            this.score = validateLevelScore(score);
        } catch (e) {
            console.error(e);
        }
    }

    // return a deep copy of this instance
    clone() {
        try {
            return new Level(this.name, this.score);
        } catch (e) {
            console.error(e);
        }
    }

    // return true if values of level differs from ours
    diff(level) {
        try {
            return this.name !== level.name || this.score !== level.score;
        } catch (e) {
            console.error(e);
        }
    }
}

export class Classes {
    constructor(renderable = undefined) {
        try {
            this.accountId = undefined;
            this.emailAddress = undefined;
            this.levels = [];
            if (renderable !== undefined) {
                this.parse(renderable);
            }
        } catch (e) {
            console.error(e);
        }
    }

    empty() {
        try {
            return this.levels.length === 0;
        } catch (e) {
            console.error(e);
        }
    }

    setAccount(accountId, emailAddress) {
        try {
            this.accountId = validateAccountId(accountId);
            this.emailAddress = validateEmailAddress(emailAddress);
        } catch (e) {
            console.error(e);
        }
    }

    // return a deep copy of this instance
    clone() {
        try {
            let dup = new Classes();
            dup.setAccount(this.accountId, this.emailAddress);
            for (const level of this.levels) {
                this.levels.push(level.clone());
            }
            return dup;
        } catch (e) {
            console.error(e);
        }
    }

    // return array index of level name
    indexOf(levelName) {
        try {
            for (let i = 0; i < this.levels.length; i++) {
                if (this.levels[i].name === levelName) {
                    return i;
                }
            }
            return undefined;
        } catch (e) {
            console.error(e);
        }
    }

    addLevel(name, score) {
        try {
            this.levels.push(new Level(name, score));
        } catch (e) {
            console.error(e);
        }
    }

    // return true if any values of other differ from this instance
    diff(other, compareAccounts = false) {
        try {
            if (compareAccounts) {
                if (this.accountId !== other.accountId) {
                    return true;
                }
                if (this.emailAddress !== other.emailAddress) {
                    return true;
                }
            }
            if (this.levels.length !== other.levels.length) {
                return true;
            }
            for (let i = 0; i <= this.levels.length; i++) {
                if (this.levels[i].diff(other.levels[i])) {
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    // return JSON renderable object
    render() {
        try {
            let output = { User: this.emailAddress, Classes: [] };
            for (const level of this.levels) {
                output.classes.push({ name: String(level.name), score: parseFloat(level.score) });
            }
            return output;
        } catch (e) {
            console.error(e);
        }
    }

    // parse from object or json string
    parse(input) {
        try {
            if (typeof input === "string") {
                input = JSON.parse(input);
            }

            let emailAddress = input.User;
            if (!isValidEmailAddress(emailAddress)) {
                throw new Error("input User is not a valid email address");
            }
            this.emailAddress = emailAddress;

            /*
	     * FIXME: maybe we can access the Accounts module?
	    let accountId = invalid;
	    for (const account of Object.values(accounts)) {
		if (emailAddress === accountEmail(account) ) {
		    accountId = account.id;
		    break;
		}
	    }
	    if (accountId === invalid) {
		throw new Error("input User does not match any account");
	    }
	    */

            let inputList = input.Classes;
            if (!Array.isArray(inputList)) {
                throw new Error("input Classes is not an list");
            }

            for (const item of inputList) {
                if (typeof item !== "object" || item === null) {
                    throw new Error("invalid item in Classes list");
                }
                if (Set(item.keys()) !== Set(["name", "score"])) {
                    throw new Error("invalid keys in Classes list element");
                }
                this.addLevel(item.name, item.score);
            }
        } catch (e) {
            console.error(e);
        }
    }

    validate() {
        try {
            if (this.levels.length < 2) {
                throw new Error("level count below minimum");
            }

            let lastScore = undefined;
            let spamClassFound = false;
            let uniqueNames = new Set();
            let uniqueScores = new Set();

            for (const level of this.levels) {
                if (uniqueNames.has(level.name)) {
                    throw new Error("duplicate class name");
                }
                uniqueNames.add(level.name);

                if (uniqueScores.has(level.score)) {
                    throw new Error(`duplicate threshold value '${level.score}'`);
                }
                uniqueScores.add(level.score);

                if (lastScore !== undefined && level.score < lastScore) {
                    throw new Error("thresholds not in ascending order");
                }

                if (level.name === "spam") {
                    spamClassFound = true;

                    if (level.score !== SPAM_SCORE) {
                        throw new Error("unexpected spam class threshold");
                    }
                } else {
                    if (level.score < MIN_SCORE || level.score > MAX_SCORE) {
                        throw new Error(`threshold out of range: '${level.score}'`);
                    }
                }
            }

            if (!spamClassFound) {
                throw new Error("missing spam class");
            }
        } catch (e) {
            console.error(e);
        }
    }
}

export class Books {
    constructor(renderable = undefined) {
        try {
            this.accountId = undefined;
            this.emailAddress = undefined;
            this.books = new Map();
            if (renderable !== undefined) {
                this.parse(renderable);
            }
        } catch (e) {
            console.error(e);
        }
    }

    empty() {
        try {
            return this.books.size === 0;
        } catch (e) {
            console.error(e);
        }
    }

    setAccount(accountId, emailAddress) {
        try {
            this.accountId = validateAccountId(accountId);
            this.emailAddress = validateEmailAddress(emailAddress);
        } catch (e) {
            console.error(e);
        }
    }

    addBook(name) {
        try {
            name = validateBookName(name);
            if (this.books.has(name)) {
                throw new Error("book name exists");
            }
            this.books.set(name, []);
        } catch (e) {
            console.error(e);
        }
    }

    addAddress(bookName, address) {
        try {
            bookName = validateBookName(bookName);
            address = validateEmailAddress(address);
            let addresses = this.books.get(bookName);
            if (addresses === undefined) {
                throw new Error("unknown book name");
            }
            let uniques = new Set();
            addresses.forEach((address) => uniques.add(address));
            if (uniques.has(address)) {
                console.warn("ignoring duplicate address:", address);
            } else {
                addresses.push(address);
            }
        } catch (e) {
            console.error(e);
        }
    }

    names() {
        try {
            let names = [];
            this.books.keys().forEach((name) => names.push(name));
            names.sort();
            return names;
        } catch (e) {
            console.error(e);
        }
    }

    addresses(bookName) {
        try {
            let addresses = this.books.get(bookName);
            if (addresses === undefined) {
                throw new Error("unknown book name");
            }
            let result = [];
            addresses.forEach((address) => result.push(address));
            result.sort();
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    // return JSON renderable object
    render() {
        try {
            let output = { User: this.emailAddress, Books: {} };
            for (const name of this.names()) {
                output.Books[name] = [];
                for (const address of this.addresses(name)) {
                    output.Books[name].push(address);
                }
            }
            return output;
        } catch (e) {
            console.error(e);
        }
    }

    // return a deep copy of this instance
    clone() {
        try {
            let dup = new Books();
            dup.SetAccount(this.accountId, this.emailAddress);
            for (const name of this.names()) {
                dup.addBook(name);
                for (const address of this.addresses(name)) {
                    dup.addAddress(name, address);
                }
            }
            return dup;
        } catch (e) {
            console.error(e);
        }
    }

    // return true if values of other differ from values of this instance
    diff(other, compareAccounts = false) {
        try {
            if (compareAccounts) {
                if (this.accountId !== other.accountId) {
                    return true;
                }
                if (this.emailAddress != other.emailAddress) {
                    return true;
                }
            }
            if (this.books.size != other.books.size) {
                return true;
            }
            const thisNames = this.names();
            const otherNames = other.names();
            for (let i = 0; i < thisNames.length; i++) {
                const name = thisNames[i];
                if (name !== otherNames[i]) {
                    return true;
                }
                const thisAddresses = this.addresses(name);
                const otherAddresses = other.addresses(name);
                if (thisAddresses.length != otherAddresses.length) {
                    return true;
                }
                for (let j = 0; j < thisAddresses.length; j++) {
                    if (thisAddresses[j] !== otherAddresses[j]) {
                        return true;
                    }
                }
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    // parse object or json string
    parse(input) {
        try {
            if (typeof input === "string") {
                input = JSON.parse(input);
            }

            let emailAddress = input.User;
            if (!isValidEmailAddress(emailAddress)) {
                throw new Error("input User is not a valid email address");
            }
            this.emailAddress = emailAddress;

            /*
	     * FIXME: (see Classes)
	    let accountId = undefined;
	    for (const account of Object.values(accounts)) {
		if (emailAddress === accountEmail(account) ) {
		    accountId = account.id;
		    break;
		}
	    }
	    if (accountId === invalid) {
		throw new Error("input User does not match any account");
	    }

	    */

            let inputBooks = input.Books;

            if (typeof inputBooks !== "object") {
                throw new Error("input Books not an object");
            }

            for (const [name, addresses] of Object.entries(inputBooks)) {
                this.addBook(name);
                if (!Array.isArray(addresses)) {
                    throw new Error("illegal address list type");
                }
                for (const address of addresses) {
                    this.addAddress(name, address);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}

/*
export class AccountFilterData {
    constructor(accountId) {
	this.account = account;
	this.server = new Map();
	this.dirty = new Map();
    }
}
*/

export class FilterData {
    constructor(state, accounts, type, defaultItems, editorTab) {
        try {
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
                    this.resultKey = "Classes";
                    break;
                case BOOKS:
                    this.msg.notFound = "Address book not present";
                    this.msg.updateOk = "Address book updated successfully";
                    this.msg.updateFail = "Failed to update all changed address books";
                    this.msg.validateFail = "Set address books failed validation:";
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

            this.classes = { dirty: this.parseFromState(state.dirty), server: this.parseFromState(state.server) };
            this.accounts = accounts;
        } catch (e) {
            console.error(e);
        }
    }

    state() {
        try {
            return { classes: { dirty: this.renderToState(this.classes.dirty), server: this.renderToState(this.classes.server) } };
        } catch (e) {
            console.errors(e);
        }
    }

    parseFromState(state) {
        try {
            console.debug("parseFromState:", state);
            let classes = {};
            for (let [accountId, renderable] of Object.entries(state)) {
                let emailAddress = accountEmail(this.accounts[accountId]);
                let filters = this.newDataClass(renderable);
                console.assert(
                    filters.emailAddress === emailAddress,
                    "state import account email address mismatch",
                    renderable,
                    filters,
                );
                filters.setAccount(accountId, emailAddress);
                classes[accountId] = filters;
            }
            console.debug("parseFromState returning:", classes);
            return classes;
        } catch (e) {
            console.error(e);
        }
    }

    renderToState(classes) {
        try {
            console.debug("renderToState:", classes);
            let state = {};
            for (let [accountId, filters] of Object.entries(classes)) {
                state[accountId] = filters.render();
            }
            console.debug("renderToState returning:", state);
            return state;
        } catch (e) {
            console.error(e);
        }
    }

    all() {
        try {
            let classes = {};
            for (const [accountId, filterData] of Object.entries(this.classes.server)) {
                if (accountId in this.classes.dirty) {
                    classes[accountId] = this.classes.dirty[accountId].clone();
                } else {
                    classes[accountId] = filterData.clone();
                }
            }
            return classes;
        } catch (e) {
            console.error(e);
        }
    }

    items(account) {
        try {
            if (account.id in this.classes.server) {
                if (account.id in this.classes.dirty) {
                    return this.classes.dirty[account.id].clone();
                }
                return this.classes.server[account.id].clone();
            }
            throw new Error(this.msg.notFound);
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
            const dirty = this.classes.dirty[account.id].diff(this.classes.server[account.id]);
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
            if (!force) {
                if (account.id in this.classes.server) {
                    let items = this.items(account);
                    if (!items.emtpy()) {
                        return items;
                    }
                }
            }
            let result = undefined;

            result = await sendEmailRequest(account, "dump", "", this.emailRequestTimeout, this.editorTab);
            if (verbose) {
                console.log("dump result:", result);
            }

            if (!result) {
                return { items: null, valid: false, message: "filterctl request failed; please contact support" };
            }

            await accountPasswords.set(account.id, result.Password);

            const resultItems = this.NewDataClass(result);

            if (verbose) {
                console.debug("get: resultItems:", resultItems);
            }

            const validated = this.validate(account, resultItems);
            if (verbose) {
                console.debug("get: validated:", validated);
            }

            if (!validated.valid) {
                console.error("server response failed validation:", {
                    result: result,
                    resultItems: resultItems,
                    validated: validated,
                });
            }
            delete this.classes.dirty[account.id];
            this.classes.server[account.id] = validated.items.clone();
            return validated.items;
        } catch (e) {
            console.error(e);
        }
    }

    setItems(account, items) {
        try {
            let dirty = items.diff(this.classes.server[account.id]);
            if (dirty) {
                this.classes.dirty[account.id] = items.clone();
            } else {
                delete this.classes.dirty[account.id];
            }
            return dirty;
        } catch (e) {
            console.error(e);
        }
    }

    async set(account, items) {
        try {
            let validated = this.validate(account, items);
            validated.dirty = this.setItems(account, validated.items);
            return validated;
        } catch (e) {
            console.error(e);
        }
    }

    async setDefaultItems(account) {
        try {
            await this.set(account, this.defaultItems.clone());
            return this.defaultItems.clone();
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
            let result = {};
            try {
                items.validate();
                result.message = "validated";
                result.valid = true;
            } catch (error) {
                result.message = error;
                result.valid = false;
                console.warn("filter data failed validation:", error);
            }
            result.items = items;
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    async getPassword(account) {
        try {
            if (!(await accountPasswords.has(account.id))) {
                await this.get(account, true);
            }
            let password = await accountPasswords.get(account.id);
            if (password === undefined) {
                throw new Error("CardDAV password query failed");
            }
            //FIXME: remvoe this after debugging
            console.debug("getPassword:", account, password);
            return password;
        } catch (e) {
            console.error(e);
        }
    }
}

export class FilterClasses extends FilterData {
    constructor(state, accounts, editorTab) {
        let defaultItems = new Classes();
        defaultItems.addLevel("ham", 0);
        defaultItems.addLevel("possible", 5);
        defaultItems.addLevel("spam", 999);
        super(state, accounts, CLASSES, defaultItems, editorTab);
    }

    newDataClass(renderable) {
        try {
            return new Classes(renderable);
        } catch (e) {
            console.error(e);
        }
    }

    async send(account, force) {
        try {
            const validated = this.validate(account);
            if (!validated.valid) {
                throw new Error(`Validation failed: ${validated.message}`);
            }

            if (force || validated.dirty) {
                var values = [];
                for (const level of validated.items.levels) {
                    values.push(`${level.name}=${level.score}`);
                }
                const subject = "reset " + values.join(" ");
                const result = await sendEmailRequest(account, subject, "", this.emailRequestTimeout, this.editorTab);
                if (verbose) {
                    console.log("result", result);
                }

                if (verbose) {
                    console.log("parsing send response");
                }
                const resultClass = this.newDataClass(result);
                if (verbose) {
                    console.log("parsed send response:", resultClass);
                }

                const validatedResult = this.validateItems(resultClass);
                if (validatedResult.error) {
                    console.debug("account:", account);
                    console.debug("result", result);
                    console.debug("resultClass:", resultClass);
                    console.debug("validatedResult:", validatedResult);
                    console.error("send result failed validation:", validatedResult.message);
                    throw new Error(`send result failed validation: ${validatedResult.messasge}`);
                }
                if (validated.items.diff(validatedResult.items)) {
                    console.debug("FilterClasses.send: readback mismatch:", {
                        account: account,
                        result: result,
                        resultClass: resultClass,
                        validated: validated,
                        validatedResult: validatedResult,
                    });
                    throw new Error("send result failed: readback mismatch");
                }
                delete this.classes.dirty[account.id];
                this.classes.server[account.id] = validated.items.clone();
                return { success: true, error: false, message: "classes sent successfully" };
            }
            return { success: true, error: false, message: "classes unchanged" };
        } catch (e) {
            console.error(e);
            return { success: false, error: true, message: `${e}` };
        }
    }
}

export class FilterBooks extends FilterData {
    constructor(state, accounts, editorTab) {
        let defaultItems = new Books();
        super(state, accounts, BOOKS, defaultItems, editorTab);
    }

    newDataClass(renderable) {
        try {
            return new Books(renderable);
        } catch (e) {
            console.error(e);
        }
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
                    const username = accountEmail(account);
                    const command = "restore";
                    const request = { Dump: { Users: {} } };
                    request.Dump.Users[username] = { Books: validated.items };
                    console.debug("request:", request);
                    console.debug("JSON:", JSON.stringify(request, null, 2));
                    await responseCache.pop(username);
                    if (verbose) {
                        console.log("FilterBooks.send:", { account: account, command: command, request: request });
                    }
                    const result = await sendEmailRequest(account, command, request, this.emailRequestTimeout, this.editorTab);
                    if (verbose) {
                        console.log("result", result);
                    }
                    const returned = result.Books;
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
                    return { success: true, error: false, message: "address books sent successfully" };
                }
            }
            return { success: true, error: false, message: "address books unchanged" };
        } catch (e) {
            console.error(e);
            return { success: false, error: true, message: `${e}` };
        }
    }

    validateItemContainer(items) {
        try {
            console.debug("items:", typeof items, items);
            if (typeof items !== "object") {
                return "unexpected data type: " + typeof items;
            }
            for (const [key, value] of Object.entries(items)) {
                console.debug("key:", typeof key, key);
                console.debug("value:", typeof value, value);
                if (typeof key !== "string") {
                    return "unexpected book name data type: " + typeof key;
                }
                if (!(value instanceof Array)) {
                    return "unexpected book address list data type: " + typeof value;
                }
            }
            return null;
        } catch (e) {
            console.error(e);
        }
    }

    validateBookName(bookname) {
        try {
            if (!isValidBookName(bookname)) {
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
            const emailSet = new Set();
            for (const address in addresses) {
                if (typeof address !== "string") {
                    return prefix + "unexpected address data type: " + typeof address;
                }
                if (!isValidEmailAddress(address)) {
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
            items = deepCopy(items);
            var error = this.validateItemContainer(items);
            if (error) {
                return { items: items, error: error };
            }
            for (const [bookName, addresses] of Object.entries(items)) {
                error = this.validateBookName(bookName);
                if (error) {
                    return { items: items, error: error };
                }
                error = this.validateAddressList(bookName, addresses);
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
