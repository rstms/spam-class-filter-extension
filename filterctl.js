import { sendEmailRequest } from "./email.js";
import { AsyncMap } from "./asyncmap.js";
import { accountEmailAddress, isValidEmailAddress, isValidBookName } from "./common.js";

/* global console */

//////////////////////////////////////////////////////////
//
// FilterDataController
//   base class for managing classes & books data sets for each account
//
//   FilterBooks - subclassed FilterDataController for Books
//   FilterClasses - subclassed FilterDataController for Classes
//
// FilterData
//   base class representing managed Classes and Books items
//

const verbose = true;

const DEFAULT_CLASS_LEVELS = {
    ham: 0,
    probable: 5,
    spam: 999,
};

const SUCCESS = true;
const FAILURE = false;

const MIN_SCORE = parseFloat(-100.0);
const MAX_SCORE = parseFloat(100.0);
const SPAM_SCORE = parseFloat(999);

const EMAIL_REQUEST_TIMEOUT = undefined;

const CLASSES = "classes";
const BOOKS = "books";

//let responseCache = new AsyncMap();
let accountPasswords = new AsyncMap();

function validateType(type) {
    if (typeof type === "string") {
        if (type === CLASSES || type === BOOKS) {
            return;
        }
    }
    throw new Error("unexpected type:" + type);
}

function isValidScore(score) {
    const stringValue = String(score);
    const parsedValue = parseFloat(stringValue);
    return isFinite(parsedValue) && !isNaN(parsedValue) && parsedValue.toString() === stringValue;
}

export function validateLevelName(name) {
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

export function validateLevelScore(score) {
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

export function validateEmailAddress(emailAddress) {
    if (!isValidEmailAddress(emailAddress)) {
        throw new Error("emailAddress is not a valid email address string");
    }
    return emailAddress;
}

export function validateBookName(bookName) {
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
            this.valid = false;
            this.error = null;
            if (this.set(name, score)) {
                this.valid = true;
            }
        } catch (e) {
            this.error = e;
            console.error(e);
        }
    }

    // return a deep copy of this instance
    clone() {
        try {
            let dup = new Level(this.name, this.score);
            if (!dup.valid) {
                throw new Error("Level: clone validation failed: " + dup.error);
            }
            return dup;
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

    set(name, score) {
        try {
            this.name = validateLevelName(name);
            this.score = validateLevelScore(score);
            return true;
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
        }
    }
}

// base class for Classes, Books dataset items
export class FilterData {
    constructor(accountId = undefined, emailAddress = undefined) {
        try {
            this.type = undefined;
            this.error = null;
            this.valid = false;
            if (accountId !== undefined) {
                this.accountId = validateAccountId(accountId);
            }
            if (emailAddress !== undefined) {
                this.emailAddress = validateEmailAddress(emailAddress);
            }
        } catch (e) {
            this.error = e;
            console.error(e);
        }
    }

    setAccount(accountId, emailAddress) {
        try {
            this.accountId = validateAccountId(accountId);
            this.emailAddress = validateEmailAddress(emailAddress);
            return true;
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
        }
    }

    parse(input) {
        try {
            console.debug("FilterData.parse:", input);
            if (typeof input === "string") {
                input = JSON.parse(input);
            }
            let emailAddress = input.User;
            if (!isValidEmailAddress(emailAddress)) {
                throw new Error("input User is not a valid email address");
            }
            if (this.emailAddress !== undefined && this.emailAddress != emailAddress) {
                throw new Error("email address mismatch");
            }
            this.emailAddress = emailAddress;
            return input;
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
        }
    }
}

// Classes filterset element contains spam class filter levels for an account
export class Classes extends FilterData {
    constructor(renderable = undefined, accountId = undefined, accountEmail = undefined) {
        super(accountId, accountEmail);
        try {
            this.type = CLASSES;
            this.typeName = "FilterClasses";
            this.levels = [];
            if (renderable !== undefined) {
                this.parse(renderable);
            }
        } catch (e) {
            this.error = e;
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

    // return a deep copy of this instance
    clone() {
        try {
            let dup = new Classes();
            dup.setAccount(this.accountId, this.emailAddress);
            for (const level of this.levels) {
                dup.levels.push(level.clone());
            }
            if (this.valid != dup.validate()) {
                throw new Error("Classes: clone validation mismatch");
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

    // add a spam class level with specified name and threshold score
    addLevel(name, score) {
        try {
            let level = new Level(name, score);
            if (level.valid) {
                this.levels.push(level);
                return true;
            }
            this.error = level.error;
            return false;
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
        }
    }

    // return true if any values of other differ from this instance
    diff(other, compareAccounts = true) {
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
            for (let i = 0; i < this.levels.length; i++) {
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
                output["Classes"].push({ name: String(level.name), score: parseFloat(level.score) });
            }
            console.debug("Classes.render: returning:", output);
            return output;
        } catch (e) {
            console.error(e);
        }
    }

    // parse from object or json string and validate
    parse(input) {
        try {
            console.debug("Classes.parse:", input);
            input = super.parse(input);
            if (input === false) {
                throw new Error(this.error);
            }
            let inputList = input.Classes;
            if (typeof inputList !== "object" || !Array.isArray(inputList)) {
                throw new Error("input Classes is not a valid list");
            }

            for (const item of inputList) {
                if (typeof item !== "object" || item === null) {
                    throw new Error("invalid item in Classes list");
                }
                if (!this.addLevel(item.name, item.score)) {
                    throw new Error(this.error);
                }
            }
            return this.validate();
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
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

                if (lastScore !== undefined) {
                    if (level.score < lastScore) {
                        throw new Error("thresholds not in ascending order");
                    }
                }
                lastScore = level.score;

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
            this.valid = true;
            return true;
        } catch (e) {
            this.error = e;
            this.valid = false;
            console.error(e);
            return false;
        }
    }

    // render the command subject line for an update request
    renderUpdateRequest() {
        try {
            var values = [];
            for (const level of this.levels) {
                values.push(level.name + "=" + String(level.score));
            }
            let request = {
                command: "reset " + values.join(" "),
                body: {},
            };
            return request;
        } catch (e) {
            console.error(e);
        }
    }

    parseUpdateResponse(response) {
        try {
            // the regular parser can handle the reset command response too
            return this.parse(response);
        } catch (e) {
            console.error(e);
        }
    }
}

// Books filterset element contains address book filters for an account
export class Books extends FilterData {
    constructor(renderable = undefined, accountId = undefined, accountEmail = undefined) {
        super(accountId, accountEmail);
        try {
            this.type = BOOKS;
            this.typeName = "FilterBooks";
            this.books = new Map();
            if (renderable !== undefined) {
                try {
                    this.parse(renderable);
                } catch (e) {
                    this.error = e;
                    throw new Error(e);
                }
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

    addBook(name) {
        try {
            name = validateBookName(name);
            if (this.books.has(name)) {
                throw new Error("book name exists");
            }
            this.books.set(name, []);
            return true;
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
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
            return true;
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
        }
    }

    names() {
        try {
            let names = [];
            for (const name of this.books.keys()) {
                names.push(name);
            }
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
            for (const address of addresses) {
                result.push(address);
            }
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
            console.debug("Books.render: returning:", output);
            return output;
        } catch (e) {
            console.error(e);
        }
    }

    // return a deep copy of this instance
    clone() {
        try {
            let dup = new Books();
            dup.setAccount(this.accountId, this.emailAddress);
            for (const name of this.names()) {
                dup.addBook(name);
                for (const address of this.addresses(name)) {
                    dup.addAddress(name, address);
                }
            }
            if (this.valid != dup.validate()) {
                throw new Error("Books: clone validation mismatch");
            }
            return dup;
        } catch (e) {
            console.error(e);
        }
    }

    // return true if values of other differ from values of this instance
    diff(other, compareAccounts = true) {
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
            console.debug("Books.parse:", input);
            input = super.parse(input);
            if (input === false) {
                throw new Error(this.error);
            }

            let inputBooks = input.Books;

            if (typeof inputBooks !== "object") {
                throw new Error("input Books not an object");
            }

            for (const [name, addresses] of Object.entries(inputBooks)) {
                if (!this.addBook(name)) {
                    throw new Error(this.error);
                }
                if (!Array.isArray(addresses)) {
                    throw new Error("illegal address list type");
                }
                for (const address of addresses) {
                    if (!this.addAddress(name, address)) {
                        throw new Error(this.error);
                    }
                }
            }
            return this.validate();
        } catch (e) {
            this.error = e;
            console.error(e);
            return false;
        }
    }

    validate() {
        try {
            if (!("books" in this)) {
                throw new Error("missing books propery");
            }
            if (!(this.books instanceof Map)) {
                throw new Error("books is not Map type");
            }
            for (let [name, list] of this.books) {
                validateBookName(name);
                if (!(list instanceof Array)) {
                    throw new Error("invalid address list type");
                }
                for (let address of list) {
                    validateEmailAddress(address);
                }
            }
            this.valid = true;
            return true;
        } catch (e) {
            this.error = e;
            this.valid = false;
            console.error(e);
            return false;
        }
    }

    renderUpdateRequest() {
        try {
            let renderable = this.render();
            let request = {
                command: "restore",
                body: { Dump: { Users: {} } },
            };
            request.body.Dump.Users[this.accountEmail] = renderable;
            console.debug("FilterBooks: request object:", request.body);
            console.debug("FilterBooks: request JSON:", JSON.stringify(request.body, null, 2));
            return request;
        } catch (e) {
            console.error(e);
        }
    }

    parseServerResponse(response) {
        try {
            // FIXME
            console.debug("Books.parseServerResponse:", response);
            throw new Error("unimplemented");
        } catch (e) {
            console.error(e);
        }
    }
}

//
// a dataset is an instance of Classes or Books
// server datasets cache data from latest server response
// dirty datasets contain unsaved local changes
//
// datasets:
//   classes:
//     server:
//       accountId: Classes
//       accountId: Classes
//     dirty:
//       accountId: Clasees
//   books:
//	server:
//	  accountId: Books
//	  accountId: Books
//	dirty:
//

export class FilterDataController {
    constructor(accounts, state) {
        try {
            this.accounts = accounts;
            state = this.initState(state);
            this.datasets = {
                classes: {},
                books: {},
            };
            this.datasets.classes.dirty = this.initDatasets(CLASSES, state.classes.dirty);
            this.datasets.classes.server = this.initDatasets(CLASSES, state.classes.server);
            this.datasets.books.dirty = this.initDatasets(BOOKS, state.books.dirty);
            this.datasets.books.server = this.initDatasets(BOOKS, state.books.server);
            //this.dumpResponseCache = new AsyncMap();
        } catch (e) {
            console.error(e);
        }
    }

    validateAccount(account) {
        try {
            console.debug("validateAccount:", account);
            if (typeof account === "object") {
                if ("id" in account && "identities" in account) {
                    if (account.id in this.accounts) {
                        return;
                    } else {
                        console.debug("unknown account:", account, this.accounts);
                        throw new Error("unknown account");
                    }
                }
            }
            console.debug("invalid account specified", account, this.accounts);
            throw new Error("invalid account specified");
        } catch (e) {
            console.error(e);
        }
    }

    // ensure passed-in state object has valid structure
    initState(state) {
        try {
            if (typeof state !== "object") {
                console.warn("resetting undefined state");
                state = {
                    classes: {
                        dirty: {},
                        server: {},
                    },
                    books: {
                        dirty: {},
                        server: {},
                    },
                };
            }
            this.validateState(state, state.classes.server);
            this.validateState(state, state.classes.dirty);
            this.validateState(state, state.books.server);
            this.validateState(state, state.books.dirty);
            return state;
        } catch (e) {
            console.error(e);
        }
    }

    // ensure that state data subtree contains objects keyed by accountId
    validateState(state, substate) {
        try {
            for (let [accountId, renderable] of Object.entries(substate)) {
                if (!(accountId in this.accounts) || typeof renderable !== "object") {
                    console.debug("invalid state data", substate, state);
                    throw new Error("invalid state data");
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    // called with a sub-element of the state object passed to the constructor
    // returns object keyed by accountID with dataset values of type Books or Classes
    // these dataset objects are initialized from the state data and self-validate
    initDatasets(type, substate) {
        try {
            validateType(type);
            let result = {};
            for (const [accountId, renderable] of Object.entries(substate)) {
                let dataset = datasetFactory(type, renderable, this.accounts[accountId]);
                if (dataset.valid) {
                    result[accountId] = dataset;
                } else {
                    throw new Error(dataset.error);
                }
            }
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    // return JSON-renderable object containing controller's dataset state
    state() {
        try {
            return {
                classes: {
                    dirty: this.renderToState(this.datasets.classes.dirty),
                    server: this.renderToState(this.datasets.classes.server),
                },
                books: {
                    dirty: this.renderToState(this.datasets.books.dirty),
                    server: this.renderToState(this.datasets.books.server),
                },
            };
        } catch (e) {
            console.error(e);
        }
    }

    // return JSON-renderable version of the {accountID: dataset} object
    renderToState(datasets) {
        try {
            console.debug("renderToState:", datasets);
            let output = {};
            for (let [accountId, dataset] of Object.entries(datasets)) {
                output[accountId] = dataset.render();
            }
            console.debug("renderToState returning:", output);
            return output;
        } catch (e) {
            console.error(e);
        }
    }

    /*
    // return a new dataset object of specified type
    datasetFactory(type, renderable = undefined, account = undefined) {
	try {
	    validateType(type);
            switch (type) {
                case BOOKS:
                    return BooksFactory(renderable, account);
                case CLASSES:
                    return ClassesFactory(renderable, account);
            }
	} catch(e) {
	    console.error(e);
	}
    */

    // return {accountId: dataset} mapping for all cached datasets including local unsaved changes
    all(type) {
        try {
            validateType(type);
            let result = {};
            for (const [accountId, dataset] of Object.entries(this.datasets[type].server)) {
                if (accountId in this.datasets[type].dirty) {
                    result[accountId] = this.datasets[type].dirty[accountId].clone();
                } else {
                    result[accountId] = dataset.clone();
                }
            }
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    allClasses() {
        try {
            return this.all(CLASSES);
        } catch (e) {
            console.error(e);
        }
    }

    allBooks() {
        try {
            return this.all(BOOKS);
        } catch (e) {
            console.error(e);
        }
    }

    // NOTE: was items(account)
    getDataset(type, account, throwNotFoundException = false) {
        try {
            validateType(type);
            this.validateAccount(account);
            if (account.id in this.datasets[type].server) {
                if (account.id in this.datasets[type].dirty) {
                    return this.datasets[type].dirty[account.id].clone();
                }
                return this.datasets[type].server[account.id].clone();
            }
            if (throwNotFoundException) {
                throw new Error(type + " dataset not found for account " + account.name);
            }
            return undefined;
        } catch (e) {
            console.error(e);
        }
    }

    // check if data for the specified type and account has been requested and cached
    isCached(type, account) {
        try {
            validateType(type);
            this.validateAccount(account);
            return account.id in this.datasets[type].server;
        } catch (e) {
            console.error(e);
        }
    }

    isClassesDatasetCached(account) {
        try {
            return this.isCached(CLASSES, account);
        } catch (e) {
            console.error(e);
        }
    }

    isBooksDatasetCached(account) {
        try {
            return this.isCached(BOOKS, account);
        } catch (e) {
            console.error(e);
        }
    }

    // check if data for the specified type and account has pending local changes
    isDirty(type, account) {
        try {
            validateType(type);
            this.validateAccount(account);
            let serverSet = this.datasets[type].server;
            let dirtySet = this.datasets[type].dirty;
            if (!(account.id in serverSet)) {
                return false;
                //FIXME: don't throw error if the caller is just asking if the account has unsaved changes
                //throw new Error(type + " dataset not found for account " + account.name);
            }
            if (!(account.id in dirtySet)) {
                return false;
            }
            const dirty = dirtySet[account.id].diff(serverSet[account.id]);
            if (!dirty) {
                delete this.datasets[type].dirty[account.id];
            }
            return dirty;
        } catch (e) {
            console.error(e);
        }
    }

    isClassesDirty(account) {
        try {
            return this.isDirty(CLASSES, account);
        } catch (e) {
            console.error(e);
        }
    }

    isBooksDirty(account) {
        try {
            return this.isDirty(BOOKS, account);
        } catch (e) {
            console.error(e);
        }
    }

    async getClasses(account, force = false) {
        try {
            return await this.get(CLASSES, account, force);
        } catch (e) {
            console.error(e);
        }
    }

    async getBooks(account, force = false) {
        try {
            return await this.get(BOOKS, account, force);
        } catch (e) {
            console.error(e);
        }
    }

    //
    // return value from get or set
    // return: {
    //	    success: bool
    //	    source: "cache" or "server"
    //	    message: "description of result or error message if failed"
    //	    books: dataset object
    //	    OR
    //	    classes: dataset_object
    // }
    //
    // return value will contain one of: (books, classes) depending on type parameter
    //

    async get(type, account, force = false) {
        try {
            validateType(type);
            this.validateAccount(account);

            if (!force) {
                if (this.isCached(type, account)) {
                    let dataset = this.getDataset(type, account);
                    let message = dataset.typeName + " refreshed from cache";
                    return this.datasetResult(type, account, dataset, SUCCESS, message);
                }
            }

            console.debug("get: sending filterctl dump request:", type, account);
            let response = await sendEmailRequest(account, "dump", {}, EMAIL_REQUEST_TIMEOUT);
            console.debug("get: filterctl response:", response);
            if (response === undefined || !response) {
                console.error("filterctl request failed:", response);
                throw new Error("Unknown filterctl request failure");
            }

            // parse password from response
            await accountPasswords.set(account.id, response.Password);

            // parse classes from response
            let classes = datasetFactory(CLASSES, response, account);
            if (!classes.valid) {
                console.error("Classes validation failure:", response, classes);
                throw new Error("Unexpected FilterClasses response");
            }
            this.datasets.classes.server[account.id] = classes;

            // parse books from response
            let books = datasetFactory(BOOKS, response, account);
            if (!books.valid) {
                console.error("Books validation Failure:", response, books);
                throw new Error("Unexpected FilterBooks response");
            }
            this.datasets.books.server[account.id] = books;

            // clear pending changes only for the requested type
            delete this.datasets[type].dirty[account.id];

            let dataset = this.datasets[type].server[account.id].clone();
            let message = dataset.typeName + " refreshed from server";
            return this.datasetResult(type, account, dataset, SUCCESS, message);
        } catch (e) {
            console.error(e);
            let error = "Request failed: " + String(e) + "; Please contact support.";
            return this.datasetResult(type, account, undefined, FAILURE, error);
        }
    }

    datasetResult(type, account, dataset, success, message) {
        try {
            let result = {
                success: success,
                message: message,
                accountId: account.id,
            };
            result[type] = dataset.render();
            if (dataset !== undefined) {
                result.valid = dataset.valid;
                result.dirty = this.isDirty(dataset.type, account);
            }
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    setDataset(type, account, dataset) {
        try {
            validateType(type);
            this.validateAccount(account);
            let dirty = dataset.diff(this.datasets[type].server[account.id]);
            if (dirty) {
                this.datasets[type].dirty[account.id] = dataset.clone();
            } else {
                delete this.datasets[type].dirty[account.id];
            }
            return dirty;
        } catch (e) {
            console.error(e);
        }
    }

    async set(type, account, dataset) {
        try {
            console.debug("set:", type, account, dataset);
            let state = SUCCESS;
            let message = undefined;
            dataset.validate();
            let dirty = this.setDataset(type, account, dataset);
            if (dataset.valid) {
                if (dirty) {
                    message = "Unsaved valid " + dataset.typeName + " changes";
                } else {
                    message = "Unchanged " + dataset.typeName;
                }
            } else {
                message = "Validation failed: " + dataset.error;
                state = FAILURE;
            }
            return this.datasetResult(type, account, dataset, state, message);
        } catch (e) {
            console.error(e);
        }
    }

    async setBooks(account, books) {
        try {
            return await this.set(BOOKS, account, books);
        } catch (e) {
            console.error(e);
        }
    }

    async setClasses(account, classes) {
        try {
            console.debug("setClasses:", account, classes);
            let updateClasses = datasetFactory(CLASSES, classes, account);
            console.debug("setClasses updateClasses:", updateClasses);
            return await this.set(CLASSES, account, updateClasses);
        } catch (e) {
            console.error(e);
        }
    }

    async setDefaults(type, account) {
        try {
            let defaults = undefined;
            switch (type) {
                case CLASSES:
                    defaults = new Classes();
                    for (const [name, score] of Object.entries(DEFAULT_CLASS_LEVELS)) {
                        defaults.addLevel(name, score);
                    }
                    break;
                case BOOKS:
                    defaults = new Books();
                    break;
                default:
                    throw new Error("unexpected type");
            }
            await this.set(type, account, defaults);
            return this.datasetResult(type, account, defaults, SUCCESS, defaults.typeName + " reset to default values");
        } catch (e) {
            console.error(e);
        }
    }

    async setBooksDefaults(account) {
        try {
            return await this.setDefaults(CLASSES, account);
        } catch (e) {
            console.error(e);
        }
    }

    async setClassesDefaults(account) {
        try {
            return await this.setDefaults(BOOKS, account);
        } catch (e) {
            console.error(e);
        }
    }

    async send(type, account, force) {
        try {
            validateType(type);
            this.validateAccount(account);
            const dataset = this.getDataset(type, account);
            if (force || this.isDirty(type, account)) {
                if (!dataset.validate()) {
                    throw new Error(`Validation failed: ${dataset.error}`);
                }
                let update = dataset.renderUpdateRequest();
                if (verbose) {
                    console.debug("sending filterctl update:", update);
                }
                const response = await sendEmailRequest(account, update.command, update.body, EMAIL_REQUEST_TIMEOUT);
                if (verbose) {
                    console.debug("filterctl update response", response);
                }

                let validator = datasetFactory(type);
                if (!validator.setAccount(account.id, accountEmailAddress(account))) {
                    console.error("send: response validator setAccount failed:", dataset, update, response, validator);
                    throw new Error("Update response validation failure(1)");
                }
                if (!validator.parseUpdateResponse(response)) {
                    console.error("send: response validator parseUpdateResponse failed:", dataset, update, response, validator);
                    throw new Error("Update response validation failure(2)");
                }

                // FIXME: determine that update response results in valid dataset
                if (validator.valid) {
                    console.error("send: response failed validation:", dataset, update, response, validator);
                    throw new Error("Update response validation failure(3)");
                }

                // ensure dataset we sent matches the validator parsed from the server response
                if (dataset.diff(validator)) {
                    console.error("send: update response mismatch:", dataset, update, response, validator);
                    throw new Error("Update response mismatch(1)");
                }

                delete this.datasets[type].dirty[account.id];
                this.datasets[type].server[account.id] = dataset.clone();

                // FIXME: redundant test
                let serverSet = this.datasets[type].server[account.id];
                if (dataset.diff(serverSet)) {
                    console.error("send: dataset mismatches server cache:", dataset, serverSet);
                    throw new Error("Update response mismatch(2)");
                }

                return this.datasetResult(type, account, validator, SUCCESS, dataset.typeName + " successfully uploaded to server");
            }
            return this.datasetResult(type, account, dataset, SUCCESS, dataset.typeName + " unchanged");
        } catch (e) {
            console.error(e);
            let error = "Update Failed: " + String(e) + "; Please contact support.";
            return this.datasetResult(type, account, undefined, FAILURE, error);
        }
    }

    async sendAll(type, force = false) {
        try {
            validateType(type);
            let datasets = this.all(type);
            let resultState = SUCCESS;
            let resultAccount = undefined;
            let resultDataset = undefined;
            let resultMessage = undefined;
            for (const [accountId, dataset] of Object.entries(datasets)) {
                resultAccount = this.accounts[accountId];
                resultDataset = dataset;
                const result = await this.send(this.accounts[accountId], force);
                if (!result.success) {
                    resultState = FAILURE;
                    resultMessage = result.message;
                }
            }
            if (resultState) {
                resultMessage = resultDataset.typeName + " refreshed from server for all accounts";
            }
            return this.datasetResult(type, resultAccount, resultDataset, resultState, resultMessage);
        } catch (e) {
            console.error(e);
        }
    }

    async sendAllClasses(force = false) {
        try {
            return await this.sendAll(CLASSES, force);
        } catch (e) {
            console.error(e);
        }
    }

    async sendAllBooks(force = false) {
        try {
            return await this.sendAll(BOOKS, force);
        } catch (e) {
            console.error(e);
        }
    }

    async getPassword(account) {
        try {
            this.validateAccount(account);
            let password = await accountPasswords.get(account.id);
            if (password === undefined) {
                // perform Books query to receive password
                console.debug("getPassword: not cached; requesting dump");
                let response = await this.get(BOOKS, account, true);
                console.debug("getPassword: dump response:", response);
                password = await accountPasswords.get(account.id);
                if (password === undefined) {
                    throw new Error("CardDAV password query failed");
                }
            }
            //FIXME: remove this after debugging
            console.debug("getPassword:", account, password);
            return password;
        } catch (e) {
            console.error(e);
        }
    }
}

export function datasetFactory(type, renderable = undefined, account = undefined) {
    try {
        validateType(type);
        let accountId = undefined;
        let accountEmail = undefined;
        if (account !== undefined) {
            accountId = account.id;
            accountEmail = accountEmailAddress(account);
        }
        switch (type) {
            case BOOKS:
                return new Books(renderable, accountId, accountEmail);
            case CLASSES:
                return new Classes(renderable, accountId, accountEmail);
        }
    } catch (e) {
        console.error(e);
    }
}

export const booksFactory = (renderable = undefined, account = undefined) => datasetFactory(BOOKS, renderable, account);
export const classesFactory = (renderable = undefined, account = undefined) => datasetFactory(CLASSES, renderable, account);
