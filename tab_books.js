//
// books editor tab
//

import { config } from "./config.js";
import { Books, booksFactory, validateBookName } from "./filterctl.js";
import { accountEmailAddress } from "./common.js";

/* globals console, messenger, document */

/////////////////////////////
//
// control elements:
//
// accountSelect
// bookSelect
// addressesSelect
// statusMessage
//
// selectedSpan
// selectButton
//
// connectedCheckbox
//
// scanButton
// connectionsSelect
// disconnectButton
//
// addInput
// addButton
// deleteInput
// deleteButton
//

const verbose = true;

export class BooksTab {
    constructor(disableEditorControl, sendMessage) {
        this.disableEditorControl = disableEditorControl;
        this.controls = {};
        this.sendMessage = sendMessage;
        this.selectedAccount = undefined;
        this.bookIndex = {};

        // selectedBook, addSenderBook kept for each account
        this.connectedBooks = undefined;
        this.selectedBooks = {};
        this.addSenderBooks = {};
        this.initialized = false;
    }

    async selectAccount(account) {
        try {
            console.debug("Books.selectAccount:", account);
            this.selectedAccount = account;
            // TODO: set selected book to stored value && populate
        } catch (e) {
            console.error(e);
        }
    }

    // request books for selected account from filterctl
    async getBooks(flags) {
        try {
            if (verbose) {
                console.log("BooksTab.getBooks");
            }
            if (flags.disablePrompt !== true) {
                await this.updateStatus({ message: "Requesting FilterBooks refresh..." });
            }
            const response = await this.sendMessage({
                id: "getAccountAddressBooks",
                account: this.selectedAccount.id,
                force: flags.force === true,
            });
            const books = await this.handleResponse(response, flags.disablePopulate === true, flags.disableUpdateStatus === true);
            if (verbose) {
                console.log("BooksTab.getBooks: returning:", books);
            }
            return books;
        } catch (e) {
            console.error(e);
        }
    }

    // handle filterctl response
    async handleResponse(response, disablePopulate = false, disableUpdateStatus = false) {
        try {
            if (verbose) {
                if (verbose) {
                    console.log("handleResponse:", response);
                }
            }
            let books = response.books;
            if (typeof books !== "undefined") {
                if (typeof books === "object") {
                    // parse the rendered message data into a Books object
                    console.assert(response.accountId === this.selectedAccount.id, "server response account ID mismatch");
                    books = booksFactory(response.books, this.selectedAccount);
                }
                console.assert(books instanceof Books, "books is not an instance of Books");
                response.books = books;
                if (disablePopulate !== true) {
                    await this.populate(books);
                }
            }
            if (disableUpdateStatus !== true) {
                await this.updateStatus(response);
            }
            if (verbose) {
                console.debug("handleResponse: returning:", response.books);
            }
            return response.books;
        } catch (e) {
            console.error(e);
        }
    }

    // send command email bypassing sendMessage->background->filterctl
    async sendCommand(command, argument) {
        try {
            const message = {
                id: "sendCommand",
                accountId: this.selectedAccount.id,
                command: command,
                argument: argument,
            };
            this.setStatus("Sending command: '" + command + " " + argument + "'...");
            const response = await this.sendMessage(message);
            if (verbose) {
                console.debug("response:", response);
            }
            if (response === undefined) {
                this.setStatus("Error: command failed");
            } else {
                this.setStatus(response.Message);
            }
            return response;
        } catch (e) {
            console.error(e);
        }
    }

    async updateStatus(response) {
        try {
            this.setStatus(response.message ? response.message : "");
        } catch (e) {
            console.error(e);
        }
    }

    setStatus(text) {
        try {
            console.log("books.setStatus:", text);
            if (text !== undefined) {
                let control = this.controls.statusMessage;
                control.innerHTML = text;
            } else {
                console.error("caller attempted to set status to undefined");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async enableControls(enabled) {
        try {
            this.controls.accountSelect.disabled = !enabled;
            await this.disableEditorControl("applyButton", !enabled);
            await this.disableEditorControl("okButton", !enabled);
        } catch (e) {
            console.error(e);
        }
    }

    async getAccounts() {
        try {
            this.accounts = await this.sendMessage("getAccounts");
        } catch (e) {
            console.error(e);
        }
    }

    async getCardDAVPassword(account) {
        try {
            let response = await this.sendMessage({ id: "getPassword", accountId: account.id });
            console.debug("getPassword: response:", response);
            return response.result;
        } catch (e) {
            console.error(e);
        }
    }

    async initialize() {
        try {
            await this.getAccounts();
            // request a password now for each account to fill filterctl's books cache
            for (const account of Object.values(this.accounts)) {
                await this.getCardDAVPassword(account);
            }
            this.controls.addButton.disabled = true;
            this.controls.deleteButton.disabled = true;
            this.showConnectionControls(false);
            this.initialized = true;
        } catch (e) {
            console.error(e);
        }
    }

    async populate(books = undefined) {
        try {
            if (verbose) {
                console.debug("populate");
            }
            if (!this.initialized) {
                await this.initialize();
            }
            if (books === undefined) {
                books = await this.getBooks({ disablePopulate: true });
            }
            this.books = books;
            if (verbose) {
                console.debug("populate: books:", this.books);
            }
            this.controls.bookSelect.innerHTML = "";
            this.bookIndex = {};
            let selectBook = undefined;
            let i = 0;
            for (const name of this.books.names()) {
                if (i === 0 && this.selectedBooks[this.selectedAccount.id] === undefined) {
                    this.setSelectedBook(this.selectedAccount, name);
                }
                this.bookIndex[name] = i;
                this.bookIndex[i] = name;
                i++;
                const bookRow = document.createElement("option");
                bookRow.textContent = name;
                this.controls.bookSelect.appendChild(bookRow);
            }
            await this.populateAddSenderBook(await this.addSenderBook());
            await this.selectBook(selectBook);
            await this.enableControls(true);
        } catch (e) {
            console.error(e);
        }
    }

    async populateAddresses(bookName, addresses) {
        try {
            this.controls.addressesSelect.innerHTML = "";
            let rows = ['Addresses with header: X-Address-Book: "' + bookName + '"'];
            if (addresses.length < 1) {
                rows = ["No addresses"];
            }
            for (const address of addresses) {
                rows.push(address);
            }
            for (const rowText of rows) {
                const row = document.createElement("option");
                row.textContent = rowText;
                this.controls.addressesSelect.appendChild(row);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async populateAddSenderBook(bookName) {
        try {
            this.controls.selectedSpan.innerHTML = " " + bookName + " ";
        } catch (e) {
            console.error(e);
        }
    }

    async populateBookConnected() {
        try {
            if (this.connectedBooks !== undefined) {
                let connected = await this.isConnectedBook(this.selectedAccount, this.selectedBook());
                this.controls.connectedCheckbox.checked = connected;
            }
        } catch (e) {
            console.error(e);
        }
    }

    showConnectionControls(visible = undefined) {
        try {
            if (visible === undefined) {
                visible = this.connectedBooks !== undefined;
            }
            const names = ["connectedCheckbox", "connectedLabel", "connectionsSelect", "disconnectButton"];
            for (const name of names) {
                const control = this.controls[name];
                control.disabled = !visible;
                control.hidden = !visible;
            }
        } catch (e) {
            console.error(e);
        }
    }

    async populateConnections(account = undefined) {
        try {
            if (this.connectedBooks === undefined) {
                return;
            }
            if (account === undefined) {
                account = this.selectedAccount;
            }
            this.controls.connectionsSelect.innerHTML = "";
            let connections = this.connectedBooks[account.id];
            for (const cxn of Object.values(connections)) {
                const row = document.createElement("option");
                row.textContent = cxn.name;
                this.controls.connectionsSelect.appendChild(row);
            }
            this.showConnectionControls();
        } catch (e) {
            console.error(e);
        }
    }

    // handle new selected book, updating controls and saving selected book for each account
    async selectBook(bookName) {
        try {
            if (verbose) {
                console.debug("booksTab.selectBook:", bookName);
            }
            if (bookName === undefined) {
                bookName = this.selectedBook();
            }
            this.selectedBooks[this.selectedAccount.id] = bookName;
            await this.populateAddresses(bookName, this.books.addresses(bookName));
            await this.populateBookConnected();
            await this.populateConnections();
        } catch (e) {
            console.error(e);
        }
    }

    // return selected book name for selected account
    selectedBook() {
        try {
            let bookName = this.selectedBooks[this.selectedAccount.id];
            if (bookName === undefined) {
                throw new Error("selected book is undefined");
            }
            return bookName;
        } catch (e) {
            console.error(e);
        }
    }

    setSelectedBook(account, bookName) {
        try {
            if (bookName === undefined) {
                throw new Error("setting undefined selected book");
            }
            this.selectedBooks[account.id] = bookName;
        } catch (e) {
            console.error(e);
        }
    }

    async saveChanges() {
        try {
            if (verbose) {
                console.log("books tab save changes");
            }
            //FIXME: this should be the filterctl update response
            return { succes: true };
        } catch (e) {
            console.error(e);
        }
    }

    //////////////////////////////////////////////////////
    //
    // selected 'add sender' book management
    //
    //////////////////////////////////////////////////////

    // return the config addSenderBook or {} if not found
    async getAddSenderBooks() {
        try {
            let addSenderBooks = await config.local.get("addSenderBooks");
            if (addSenderBooks === undefined) {
                addSenderBooks = {};
            }
            return addSenderBooks;
        } catch (e) {
            console.error(e);
        }
    }

    // return the addSenderBook for the specified account
    async addSenderBook(account = undefined) {
        try {
            if (account === undefined) {
                account = this.selectedAccount;
            }
            const addSenderBooks = await this.getAddSenderBooks();
            return addSenderBooks[account.id];
        } catch (e) {
            console.error(e);
        }
    }

    // write config setting bookName as the addSenderBook for account
    async setAddSenderBook(account, bookName) {
        try {
            let addSenderBooks = await this.getAddSenderBooks();
            let changed = addSenderBooks[account.id] !== bookName;
            addSenderBooks[account.id] = bookName;
            if (changed) {
                await config.local.set("addSenderBooks", addSenderBooks);
                if (verbose) {
                    console.debug("changed addSenderBooks:", account, bookName, addSenderBooks);
                }
            }
            await this.populateAddSenderBook(bookName);
            return changed;
        } catch (e) {
            console.error(e);
        }
    }

    //////////////////////////////////////////////////////
    //
    // carddav connection management
    //
    //////////////////////////////////////////////////////

    async initConnectedBooks(account = undefined) {
        try {
            if (verbose) {
                console.debug("initConnectedBooks:", account);
            }

            this.connectedBooks = {};
            await this.getAccounts();
            for (const accountId of Object.keys(this.accounts)) {
                this.connectedBooks[accountId] = {};
            }

            this.setStatus("Scanning Address Books cardDAV connections...");
            console.log("initConnectedBooks: calling cardDAV.getBooks...");
            // FIXME: maybe pass account to getBooks here?
            // if account !== undefined, maybe only scan for connections for the specified account?
            // getBooks seems now to look for connections from all accounts
            const connections = await messenger.cardDAV.getBooks();
            console.log("initConnectedBooks: cardDAV.getBooks returned:", connections);
            this.setStatus("Address Book scan complete");
            for (const cxn of connections) {
                this.connectedBooks[cxn.UID] = cxn;
            }

            // connectedBooks holds cardDAV connections after scan
            //
            // connectedBooks {
            //	    accountId: {
            //		bookName: [
            //		    {
            //			accountId: account.id,
            //			emailAddress: emailAddress,
            //			bookName: bookName,
            //			name: connnectionName,
            //			connection: cxn
            //		   }
            //		]
            //	    }
            //	}
            //
            //	FIXME: set scan result data into connectedBooks
            //	FIXME:
            if (verbose) {
                console.debug("initConnectedBooks: this.connectedBooks:", this.connectedBooks);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async getConnectedBooks(account, force = false) {
        try {
            if (verbose) {
                console.debug("getConnectedBooks:", force);
            }
            if (force || this.connectedBooks === undefined) {
                await this.initConnectedBooks();
            }
            await this.populateConnections(account);
        } catch (e) {
            console.error(e);
        }
    }

    connectionName(account, bookName) {
        try {
            let name = accountEmailAddress(account) + "-" + bookName;
            return name.replace(/[^a-zA-Z0-9]/g, "-");
        } catch (e) {
            console.error(e);
        }
    }
    async isConnectedBook(account, bookName) {
        try {
            console.assert(this.connectedBooks !== undefined, "cardDAV not initialized");
            await this.getConnectedBooks(account);
            const connectionName = this.connectionName(account, bookName);
            let ret = false;
            for (const cxn of Object.values(this.connectedBooks)) {
                if (cxn.name === connectionName) {
                    ret = true;
                }
            }
            console.log("isConnectedBook:", ret, connectionName, bookName, account);
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    async connectBook(account, bookName) {
        try {
            await this.getConnectedBooks();
            const connectionName = this.connectionName(account, bookName);
            if (this.isConnectedBook(connectionName)) {
                this.setStatus("FilterBook " + connectionName + "is already connected");
            } else {
                this.setStatus("Connecting FilterBook " + connectionName + "...");
                const username = accountEmailAddress(account);
                const password = await this.getCardDAVPassword(account);
                // FIXME: URL is unused by cardDAV.connect
                let URL = "";
                // FIXME: cardDAV.connect seems to connect all books, ignoring bookName
                // FIXME: cardDAV.connect should take cxnName and name the connection
                console.log("connectBook: calling cardDAV.connect:", bookName, URL, username, password);
                let cxn = await messenger.cardDAV.connect(bookName, URL, username, password);
                console.log("connectBook: cardDAV.connect returned:", cxn);
                /*
		    let response = {
                    accountId: account.id,
                    bookName: bookName,
                    username: username,
                    connectionName: cxnName,
                    carddavConnection: cxn,
                };
		*/
                this.setStatus("FilterBook " + connectionName + " added to Address Books");
                return true;
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    async disconnectBook(connection) {
        try {
            if (verbose) {
                console.debug("disconnectBook:", connection);
            }
            // FIXME
            throw new Error("disconnectBook unimplemented");
            /*
            let connectedBooks = await this.getConnectedBooks();
            let count = 0;
            if (connectedBooks !== undefined) {
                for (const [accountId, connections] of Object.entries(connectedBooks)) {
                    for (const [bookName, connectionName] of Object.entries(connections)) {
                        count++;
                        if (verbose) {
                            console.log("disconnecting:", accountId, bookName, connectionName);
                        }
                    }
                    this.connectedBooks[accountId] = {};
                }
            }
            if (count === 0) {
                this.setStatus("No FilterBook CardDAV Address Books found.");
            } else {
                this.setStatus("All FilterBook CardDAV connections removed from Address Books.");
            }
	    */
        } catch (e) {
            console.error(e);
        }
    }

    async disconnectAllBooks() {
        try {
            let connections = await this.getConnectedBooks();
            console.assert(typeof connections === "object", "unexpected type: connections:", connections);
            let count = 0;
            for (const connection of Object.values(connections)) {
                count++;
                await this.disconnectBook(connection);
            }
            this.connectedBooks = {};
            if (count === 0) {
                this.setStatus("No FilterBook CardDAV Address Books found.");
            } else {
                this.setStatus("All FilterBook CardDAV connections removed from Address Books.");
            }
        } catch (e) {
            console.error(e);
        }
    }

    //////////////////////////////////////////////////////
    //
    // address book add/delete functions
    //
    //////////////////////////////////////////////////////

    isBookName(name) {
        try {
            for (const bookName of this.books.names()) {
                if (name === bookName) {
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    async addOrDeleteBook(command, prefix, control) {
        try {
            if (verbose) {
                console.log("onAddClick");
            }
            let bookName = control.value.trim();
            try {
                bookName = validateBookName(bookName);
            } catch (e) {
                this.setStatus(e);
                return;
            }
            // we may be deleting the selected book
            if (bookName === this.selectedBook()) {
                this.selectedBooks[this.selectedAccount.id] = undefined;
            }
            control.value = "";
            this.setStatus(prefix + " FilterBook '" + bookName + "'...");
            let response = await this.sendCommand(command, bookName);
            if (verbose) {
                console.log("addOrDeleteBook: response:", response);
            }
            // force refresh filterctl because we changed the books
            await this.getBooks({ force: true, noPrompt: true });
        } catch (e) {
            console.error(e);
        }
    }

    //////////////////////////////////////////////////////
    //
    // control event handlers
    //
    //////////////////////////////////////////////////////

    async onBookSelectChange(sender) {
        try {
            if (verbose) {
                console.log("onBookSelectChange:", sender);
            }
            const index = sender.target.selectedIndex;
            const bookName = this.bookIndex[index];
            if (verbose) {
                console.debug("onBookSelectChange:", index, bookName, sender.target.id);
            }
            if (bookName !== this.selectedBook()) {
                await this.selectBook(bookName);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onAddressesSelectChange(sender) {
        try {
            if (verbose) {
                console.log("onAddressesSelectChange:", sender);
            }
            sender.target.selectedIndex = 0;
        } catch (e) {
            console.error(e);
        }
    }

    async onConnectionsSelectChange(sender) {
        try {
            if (verbose) {
                console.log("onConnectionsSelectChange:", sender);
            }
            //sender.target.selectedIndex = 0;
        } catch (e) {
            console.error(e);
        }
    }

    // select current book as account 'add sender' target
    async onSelectClick() {
        try {
            if (verbose) {
                console.log("onSelectClick");
            }
            await this.setAddSenderBook(this.selectedAccount, this.selectedBook());
        } catch (e) {
            console.error(e);
        }
    }

    // switch to connect/disconnect current book cardDAV address book connection
    async onConnectedChange(sender) {
        try {
            if (verbose) {
                console.log("onConnectedChange:", sender.target.checked, sender);
            }
            if (sender.target.checked) {
                await this.disconnectBook(this.selectedAccount, this.selectedBook());
            } else {
                await this.connectBook(this.selectedAccount, this.selectedBook());
            }
        } catch (e) {
            console.error(e);
        }
    }

    // scan carddav connections button
    async onScanClick() {
        try {
            if (verbose) {
                console.log("onScanClick");
            }
            await this.initConnectedBooks();
        } catch (e) {
            console.error(e);
        }
    }

    // disconnect all button
    async onDisconnectClick() {
        try {
            if (verbose) {
                console.log("onDisconnectClick");
            }
            await this.disconnectAllBooks();

            if (verbose) {
                console.log("connectedBooks:", this.connectedBooks);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onAddInputKeyup(sender) {
        try {
            this.controls.addButton.disabled = this.isBookName(sender.target.value.trim());
        } catch (e) {
            console.error(e);
        }
    }

    async onAddClick() {
        try {
            await this.addOrDeleteBook("mkbook", "Adding", this.controls.addInput);
        } catch (e) {
            console.error(e);
        }
    }

    async onDeleteInputKeyup(sender) {
        try {
            this.controls.deleteButton.disabled = !this.isBookName(sender.target.value.trim());
        } catch (e) {
            console.error(e);
        }
    }

    async onDeleteClick() {
        try {
            await this.addOrDeleteBook("rmbook", "Deleting", this.controls.deleteInput);
        } catch (e) {
            console.error(e);
        }
    }
}
