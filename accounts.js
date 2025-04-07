import { config } from "./config.js";
import { accountDomain, verbosity } from "./common.js";

/* globals messenger, console */

// control flags
const verbose = verbosity.accounts;

///////////////////////////////////////////////////////////////////////////////
//
//  account data and selected account management
//
///////////////////////////////////////////////////////////////////////////////

// catch callers passing account instead of accountId
function validateAccountId(accountId) {
    if (typeof accountId !== "string") {
        console.error("invalid accountId:", accountId);
        throw new Error("invalid accountId");
    }
}

// ensure the account looks like an account object
function validateAccount(account) {
    if (typeof account !== "object" || typeof account.id !== "string" || !Array.isArray(account.identities)) {
        console.error("invalid account:", account);
        throw new Error("invalid account");
    }
}

export class Accounts {
    constructor(sendEvents = false) {
        console.log("Accounts.constructor:", this);
        this.domainsInitialized = false;
        this.lastSelection = undefined;
        this.listeners = new Set();
        this.sendEvents = sendEvents;
    }

    // selected account change listener
    addListener(handler) {
        try {
            this.listeners.set(handler);
        } catch (e) {
            console.error(e);
        }
    }

    removeListener(handler) {
        try {
            this.listeners.delete(handler);
        } catch (e) {
            console.error(e);
        }
    }

    // return the first enabled account
    async defaultAccount(accounts = undefined) {
        try {
            if (accounts === undefined) {
                accounts = await this.enabled();
            }
            const keys = Object.keys(accounts).sort();
            return accounts[keys[0]];
        } catch (e) {
            console.error(e);
        }
    }

    // return all imap accounts including disabled domains
    async all() {
        try {
            const accountList = await messenger.accounts.list();
            var accounts = {};
            for (const account of accountList) {
                if (account.type === "imap") {
                    accounts[account.id] = account;
                }
            }
            return accounts;
        } catch (e) {
            console.error(e);
        }
    }

    // return all imap accounts with enabled domains
    async enabled() {
        try {
            const enabledDomains = await this.enabledDomains();
            const all = await this.all();
            let accounts = {};
            for (const account of Object.values(all)) {
                const domain = accountDomain(account);
                if (enabledDomains[domain] === true) {
                    accounts[account.id] = account;
                }
            }
            return accounts;
        } catch (e) {
            console.error(e);
        }
    }

    // return account with specified accountId. by default, throw error if not found or not enabled
    async get(accountId = undefined, flags = { throwError: true }) {
        try {
            if (accountId === undefined) {
                throw new Error("deprecated: use enabled() instead of get(undefined) or get()");
            }
            validateAccountId(accountId);
            // return account with accountId
            const accounts = await this.enabled();
            const account = accounts[accountId];
            await this.isEnabled(account, flags);
            return account;
        } catch (e) {
            console.error(e);
        }
    }

    // return selected account or default selection if no selection is found
    async selected() {
        try {
            let account = await config.session.get(config.key.selectedAccount);
            if (account === undefined) {
                console.warn("selected account not found, returning default account");
            } else if (!(await this.isEnabled(account, { throwError: false }))) {
                console.warn("selected account not enabled, returning default account");
            } else {
                return account;
            }
            return await this.defaultAccount();
        } catch (e) {
            console.error(e);
        }
    }

    // set selected account - takes accountID or account
    // optional sendEvents flag overrides default setting
    async select(account, sendEvents = undefined) {
        try {
            if (sendEvents === undefined) {
                sendEvents = this.sendEvents;
            }
            // if account is string type, try it as an accountID
            if (typeof account === "string") {
                let lookup = await this.get(account);
                if (lookup === undefined) {
                    throw new Error("unknown accountId:", account);
                }
                account = lookup;
            }
            // throw error if account is not valid and enabled
            await this.isEnabled(account, { throwError: true });
            let previous = await this.selected();
            await config.session.set(config.key.selectedAccount, account);
            if (sendEvents) {
                if (account.id !== previous.id) {
                    console.log("Account selected:", account.id);
                    // notify listeners if changed
                    for (const listener of this.listeners.keys()) {
                        await listener(account);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    async selectedId() {
        try {
            const account = await this.selected();
            return account.id;
        } catch (e) {
            console.error(e);
        }
    }

    // check if account is known
    async isValid(account, flags = { throwError: false }) {
        try {
            if (flags.throwError) {
                validateAccount(account);
            }
            const accounts = await this.all();
            if (account !== undefined && accounts[account.id] !== undefined) {
                return true;
            }
            if (flags.throwError) {
                console.error("unknown account:", account);
                throw new Error("unknown account");
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    // check if account id is known and domain is enabled
    async isEnabled(account, flags = { throwError: false }) {
        try {
            if (!(await this.isValid(account, flags))) {
                return false;
            }
            const accounts = await this.enabled();
            if (accounts[account.id] !== undefined) {
                return true;
            }
            if (flags.throwError) {
                throw new Error("account domain not enabled:", account);
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  enabled account domains
    //
    ///////////////////////////////////////////////////////////////////////////////

    async initDomains() {
        try {
            // get config domains
            const configDomains = await config.local.get(config.key.domain);

            // list unique domains from all imap accounts
            const accountList = await messenger.accounts.list();
            var domains = {};
            for (const account of accountList) {
                if (account.type === "imap") {
                    domains[accountDomain(account)] = true;
                }
            }

            // set enabled values of all domains present in accountList
            for (const domain of Object.keys(domains)) {
                domains[domain] = configDomains[domain] === true ? true : false;
            }

            // update local storage domains
            await this.setDomains(domains);

            if (verbose) {
                console.log("domains:", { accounts: accountList, config: configDomains, control: domains });
            }

            this.domainsInitialized = true;

            return domains;
        } catch (e) {
            console.error(e);
        }
    }

    async domains() {
        try {
            if (!this.domainsInitialized) {
                return await this.initDomains();
            }
            return await config.local.get(config.key.domain);
        } catch (e) {
            console.error(e);
        }
    }

    async enabledDomains() {
        try {
            const domains = await this.domains();
            const enabledDomains = {};
            for (const [domain, enabled] of Object.entries(domains)) {
                if (enabled) {
                    enabledDomains[domain] = true;
                }
            }
            return enabledDomains;
        } catch (e) {
            console.error(e);
        }
    }

    async setDomainEnabled(domain, enabled) {
        try {
            let domains = await this.domains();
            domains[domain] = enabled;
            await this.setDomains(domains);
            if (enabled) {
                console.log("Domain enabled:", domain);
            } else {
                console.log("Domain disabled:", domain);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async domainEnabled(domain) {
        try {
            let domains = await this.domains();
            let enabled = domains[domain];
            if (enabled === true || enabled === false) {
                return enabled;
            }
            throw new Error("domainEnabled: unknown domain:", domain);
        } catch (e) {
            console.error(e);
        }
    }

    async setDomains(domains) {
        try {
            await config.local.set(config.key.domain, domains);
        } catch (e) {
            console.error(e);
        }
    }
}
