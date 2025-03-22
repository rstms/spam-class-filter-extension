import { config } from "./config.js";
import { domainPart } from "./common.js";

/* globals messenger, console */

// control flags
const verbose = true;

///////////////////////////////////////////////////////////////////////////////
//
//  account data and selected account management
//
///////////////////////////////////////////////////////////////////////////////

export class Accounts {
    constructor() {
        this.activeDomainsInitialized = false;
        this.listeners = new Set();
        messenger.storage.onChanged.addListener(this.handleStorageChanged);
    }

    addSelectedAccountChangeListener(handler) {
        try {
            this.listeners.set(handler);
        } catch (e) {
            console.error(e);
        }
    }

    removeSelectedAccountChangeListener(handler) {
        try {
            this.listeners.delete(handler);
        } catch (e) {
            console.error(e);
        }
    }

    getDefault(accounts) {
        try {
            const keys = Object.keys(accounts).sort();
            return accounts[keys[0]];
        } catch (e) {
            console.error(e);
        }
    }

    // NOTE: side effect: resets selectedAccount if the domain is not in the set of active domains
    async all() {
        try {
            const accountList = await messenger.accounts.list();
            const selectedAccount = await config.session.get("selectedAccount");
            //const domains = await config.local.get("domain");
            const domains = await this.activeDomains();
            var selectedDomain = null;
            if (selectedAccount) {
                selectedDomain = domainPart(selectedAccount);
            }
            var accounts = {};
            for (const account of accountList) {
                if (account.type === "imap") {
                    const domain = domainPart(account.identities[0].email);
                    if (domains[domain]) {
                        accounts[account.id] = account;
                        if (domain === selectedDomain) {
                            selectedDomain = domain;
                        }
                    }
                }
            }
            if (selectedAccount && !selectedDomain) {
                const original = selectedAccount;
                await this.select(this.getDefault(accounts));
                console.warn("selected account not active, changing:", { original: original, current: selectedAccount });
                // FIXME: send a runtime message notification of the account change
            }
            return accounts;
        } catch (e) {
            console.error(e);
        }
    }

    async get(accountId) {
        try {
            const accounts = await this.all();
            return accounts[accountId];
        } catch (e) {
            console.error(e);
        }
    }

    async getSelected() {
        try {
            let selectedAccount = await config.session.get("selectedAccount");
            if (!selectedAccount) {
                const accounts = await this.all();
                selectedAccount = this.defaultAccount(accounts);
            }
            return selectedAccount;
        } catch (e) {
            console.error(e);
        }
    }

    // NOTE: returns default account if specified account is not enabled
    // TODO: this needs to inform the editor
    async select(account) {
        try {
            if (typeof account === "string") {
                let lookup = await this.get(account);
                if (lookup === undefined) {
                    throw new Error("unknown account:", account);
                }
                account = lookup;
            }
            let previous = await this.getSelected();
            await config.session.set("selectedAccount", account);
            let newAccount = await this.getSelected();
            if (newAccount.id !== account.id) {
                console.warn("select: changed account while selecting", { requested: account, returning: newAccount });
            }
            if (newAccount.id !== previous.id) {
                for (const listener of this.listeners.keys()) {
                    await listener(account);
                }
                //await messenger.runtime.SendMessage({ id: "selectedAccountChanged", account: account, previous: previous });
            }
            return newAccount;
        } catch (e) {
            console.error(e);
        }
    }

    async getSelectedId() {
        try {
            let selected = await this.getSelected();
            return selected.id;
        } catch (e) {
            console.error(e);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  enabled account domain management
    //
    ///////////////////////////////////////////////////////////////////////////////

    async initDomains() {
        try {
            // get config domains
            const configDomains = await config.local.get("domain");

            // list unique domains from all imap accounts
            const accountList = await messenger.accounts.list();
            var domains = {};
            for (const account of accountList) {
                if (account.type === "imap") {
                    domains[domainPart(account.identities[0].email)] = true;
                }
            }

            // set enabled values of all domains present in accountList
            for (const domain of Object.keys(domains)) {
                domains[domain] = configDomains[domain] === true ? true : false;
            }

            await this.setDomains(domains);
            if (verbose) {
                console.log("domains:", { accounts: accountList, config: configDomains, control: domains });
            }

            this.activeDomainsInitialized = true;

            return domains;
        } catch (e) {
            console.error(e);
        }
    }

    async domains() {
        try {
            if (!this.domainsInitialized) {
                await this.initDomains();
            }
            return await config.local.get("domain");
        } catch (e) {
            console.error(e);
        }
    }

    async activeDomains() {
        try {
            const domains = await this.domains();
            const activeDomains = {};
            for (const [domain, active] of Object.entries(domains)) {
                if (active) {
                    activeDomains[domain] = true;
                }
            }
            return activeDomains;
        } catch (e) {
            console.error(e);
        }
    }

    async setDomainEnabled(domain, enabled) {
        try {
            let domains = await this.domains();
            domains[domain] = enabled;
            await this.setDomains(domains);
        } catch (e) {
            console.error(e);
        }
    }

    async domainEnabled(domain) {
        try {
            let domains = await this.domains();
            let enabled = domains[domain];
            console.assert(enabled !== undefined, "domainEnabled: unknown domain:", domain);
            return domain === true ? true : false;
        } catch (e) {
            console.error(e);
        }
    }

    async setDomains(domains) {
        try {
            await config.local.set("domain", domains);
        } catch (e) {
            console.error(e);
        }
    }

    async selectedFilterBook(account) {
        try {
            let selected = await config.local.get("selectedFilterBookNames");
            if (selected === undefined) {
                selected = {};
            }
            return selected[account.id];
        } catch (e) {
            console.error(e);
        }
    }

    async setSelectedFilterBook(account, book) {
        try {
            let bookName = book;
            if (typeof book === "object") {
                bookName = book.name;
            }
            console.assert(typeof bookName === "string", "unexpected book type", book);
            let selected = await config.local.get("selectedFilterBookNames");
            if (selected === undefined) {
                selected = {};
            }
            selected[account.id] = bookName;
            await config.local.set("selectedFilterBookNames", selected);
        } catch (e) {
            console.error(e);
        }
    }
}
