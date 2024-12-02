
import { getConfig } from "./config.js"; 

function defaultAccountId(accounts) {
    const keys = Object.keys(accounts).sort()
    return keys[0];
}

export function domainPart(text) {
    return text.split('@')[1];
}

export async function getAccounts() {
    var session = await browser.storage.session.get(["accounts"]);
    if (session.accounts) {
	return session.accounts;
    }
    var ret = {};
    try {
	var accountList = await browser.accounts.list();
	const config = await getConfig();
	for (const account of accountList) {
	    if (account.type === "imap" ) {
		const domain = domainPart(account.identities[0].email)
		if ( config.domain[domain] ) {
		    ret[account.id] = account;
		}
	    }
	}
	try {
	    await browser.storage.session.set({accounts: ret});
	 } catch(error) { console.log("session.set failed:", error); }
    } catch(error) { console.log("browser.accounts.list failed:", error); }
    return ret;
}

export async function getAccount(accountId) {
    const accounts = await getAccounts();
    return accounts[accountId];
}

export async function getCurrentAccount() {
    const accountId = await getCurrentAccountId;
    const account = await getAccount(accountId);
    return account
}

export async function setCurrentAccount(account = null) {
    var accountId = null;
    if ( account ) {
	accountId = account.id;
    }
    accountId = await setCurrentAccountId(accountId);
    account = await getAccount(accountId);
    return account
}

export async function setCurrentAccountId(accountId = null) {
    const accounts = await getAccounts();
    if (!accounts[accountId]) {
	accountId=defaultAccountId(accounts);
	console.log("invalid accountID; setting currentAccountID to:", accountId);
    }
    await browser.storage.session.set({currentAccountId: accountId});
    return accountId;
}

export async function getCurrentAccountId() {
    const session = await browser.storage.session.get(["currentAccountId"]);
    if (session.currentAccountId) {
	return session.currentAccountId;
    }
    const accounts = await getAccounts();
    return defaultAccountId(accounts);
}
