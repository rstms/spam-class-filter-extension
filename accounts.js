import * as config from "./config.js";
import { domainPart } from "./common.js";

function defaultAccountId(accounts) {
    const keys = Object.keys(accounts).sort();
    return keys[0];
}

export async function all() {
    try {
        var session = await browser.storage.session.get(["accounts"]);
        if (session.accounts) {
            return session.accounts;
        }
        var ret = {};
        var accountList = await browser.accounts.list();
        const domains = await config.get("domain");
        for (const account of accountList) {
            if (account.type === "imap") {
                const domain = domainPart(account.identities[0].email);
                if (domains[domain]) {
                    ret[account.id] = account;
                }
            }
        }
        await browser.storage.session.set({ accounts: ret });
        return ret;
    } catch (e) {
        console.error(e);
    }
}

export async function get(accountId) {
    try {
        const accounts = await all();
        return accounts[accountId];
    } catch (e) {
        console.error(e);
    }
}

export async function current() {
    try {
        const accountId = await currentId();
        const account = await get(accountId);
        return account;
    } catch (e) {
        console.error(e);
    }
}

export async function setCurrent(account = null) {
    try {
        var accountId = null;
        if (account) {
            accountId = account.id;
        }
        accountId = await setCurrentId(accountId);
        account = await get(accountId);
        return account;
    } catch (e) {
        console.error(e);
    }
}

export async function setCurrentId(accountId = null) {
    try {
        const accounts = await all();
        if (!accounts[accountId]) {
            accountId = defaultAccountId(accounts);
            console.log("invalid accountID; setting currentAccountID to:", accountId);
        }
        await browser.storage.session.set({ currentAccountId: accountId });
        return accountId;
    } catch (e) {
        console.error(e);
    }
}

export async function currentId() {
    try {
        const session = await browser.storage.session.get(["currentAccountId"]);
        if (session.currentAccountId) {
            return session.currentAccountId;
        }
        const accounts = await all();
        return defaultAccountId(accounts);
    } catch (e) {
        console.error(e);
    }
}
