//
// books editor tab
//

import { Books, booksFactory, validateBookName } from "./filterctl.js";
import { generateUUID, accountEmailAddress, isValidBookName } from "./common.js";

/* globals console, messenger, document */

/////////////////////////////
//
// control elements:
//
// accountSelect
// bookSelect
//
// addressesMenu
//
// statusSpan
//
// addInput
// addButton
// deleteInput
// deleteButton
//
// addressesSelect
//
// addSenderSpan
// addSenderMenu
//
// connectionsDropdown
//
// table
// tableBody
// tableRow
//
// scanButton
// disconnectButton
//

const verbose = true;

//const DROPDOWN_MENU_PREFIX = '<a class="dropdown-item" href="#">';
//const DROPDOWN_MENU_SUFFIX = "</a>";

export class BooksTab {
    constructor(disableEditorControl, sendMessage, handlers) {
        this.initialized = false;
        this.disableEditorControl = disableEditorControl;
        this.sendMessage = sendMessage;
        this.handlers = handlers;
        this.controls = {};
        this.accounts = undefined;

        // current Books object
        this.books = undefined;

        // current account object
        this.account = undefined;

        this.booksIndex = {};
        this.accountIndex = {};

        // per account data
        this.connectedBooks = {};
        this.serverBooks = {};
        this.selectedBooks = {};
    }

    // called when account selection changes
    async selectAccount(account) {
        try {
            if (verbose) {
                console.debug("Books.selectAccount:", account);
            }
            let previous = this.account;
            this.account = account;
            if (previous !== account) {
                await this.populate();
                await this.populateAddSenderTarget();
                await this.populateConnections();
            }
        } catch (e) {
            console.error(e);
        }
    }

    // request books for selected account from filterctl
    async getBooks(flags) {
        try {
            if (verbose) {
                console.log("BooksTab.getBooks", flags);
            }

            let disableStatusPrompt = flags.disableStatusPrompt === true;
            let disablePopulate = flags.disablePopulate === true;
            let disableStatusUpdate = flags.disableStatusUpdate === true;

            if (!disableStatusPrompt) {
                await this.setStatus("Requesting FilterBooks refresh...", "FilterBooks request failed");
            }
            const response = await this.sendMessage({
                id: "getBooks",
                accountId: this.account.id,
                force: flags.force === true,
            });
            const books = await this.handleResponse(response, disablePopulate, disableStatusUpdate);
            if (verbose) {
                console.log("BooksTab.getBooks: returning:", books);
            }
            return books;
        } catch (e) {
            console.error(e);
        }
    }

    // handle filterctl response
    async handleResponse(response, disablePopulate = false, disableStatusUpdate = false) {
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
                    console.assert(response.accountId === this.account.id, "server response account ID mismatch");
                    books = await booksFactory(this.accounts, response.books, this.account);
                }
                console.assert(books instanceof Books, "books is not an instance of Books");
                if (!disablePopulate) {
                    await this.populate(books);
                }
            }
            if (!disableStatusUpdate) {
                await this.setStatus(response.message);
            }
            if (verbose) {
                console.debug("handleResponse: returning:", books);
            }
            return books;
        } catch (e) {
            console.error(e);
        }
    }

    async sendCommand(command, argument) {
        try {
            const message = {
                id: "sendCommand",
                accountId: this.account.id,
                command: command,
                argument: argument,
            };
            this.setStatus("Sending command: '" + command + " " + argument + "'...", "Error: timeout awaiting command response");
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

    setStatus(text, timeoutText = undefined) {
        try {
            console.log("books.setStatus:", text);

            //
            // TODO: if timeout active, clear it
            //

            if (text === undefined) {
                console.error("caller attempted to set status to undefined");
                return;
            }

            this.controls.statusSpan.innerHTML = text;

            if (timeoutText !== undefined) {
                // TODO: disable controls and set timer
            }
        } catch (e) {
            console.error(e);
        }
    }

    async enableControls(enabled) {
        try {
            let names = [
                "accountSelect",
                "bookSelect",
                "addressesButton",
                "addressesMenu",
                "addSenderButton",
                "addSenderMenu",
                "addInput",
                "deleteInput",
                "connectionsDropdown",
                "table",
                "scanButton",
                "disconnectButton",
            ];

            for (const name of names) {
                this.controls[name].disabled = !enabled;
            }
            this.enableAddButton(enabled);
            this.enableDeleteButton(enabled);
        } catch (e) {
            console.error(e);
        }
    }

    enableAddButton(enabled = undefined) {
        try {
            if (enabled !== false) {
                let name = this.controls.addInput.value.trim();
                enabled = isValidBookName(name) && !this.isBookName(name);
            }
            this.controls.addButton.disabled = !enabled;
            return enabled;
        } catch (e) {
            console.error(e);
        }
    }

    enableDeleteButton(enabled = undefined) {
        try {
            if (enabled !== false) {
                enabled = this.isBookName(this.controls.deleteInput.value.trim());
            }
            this.controls.deleteButton.disabled = !enabled;
        } catch (e) {
            console.error(e);
        }
    }

    async getCardDAVPassword(account) {
        try {
            let response = await this.sendMessage({ id: "getPassword", accountId: account.id });
            if (verbose) {
                console.debug("getPassword: response:", response);
            }
            return response.result;
        } catch (e) {
            console.error(e);
        }
    }

    async initialize() {
        try {
            this.accounts = await this.sendMessage("getAccounts");
            this.account = await this.sendMessage("getSelectedAccount");
            let i = 0;
            this.accountIndex = {};
            for (const account of Object.values(this.accounts)) {
                this.accountIndex[i] = account;
                this.accountIndex[account.id] = account;
                this.accountIndex[accountEmailAddress(account)] = account;
                i++;
            }
            this.controls.addButton.disabled = true;
            this.controls.deleteButton.disabled = true;
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
            await this.populateBooks();
            await this.enableControls(true);
        } catch (e) {
            console.error(e);
        }
    }

    async populateBooks() {
        try {
            this.controls.bookSelect.innerHTML = "";
            this.booksIndex = {};
            let i = 0;
            for (const name of this.books.names()) {
                this.booksIndex[name] = i;
                this.booksIndex[i] = name;
                i++;
                const row = document.createElement("option");
                row.textContent = name;
                this.controls.bookSelect.appendChild(row);
            }
            await this.selectBook();
        } catch (e) {
            console.error(e);
        }
    }

    // return selected book name for selected account
    selectedBook() {
        try {
            let bookName = this.selectedBooks[this.account.id];
            if (bookName === undefined) {
                bookName = this.books.names()[0];
            }
            this.selectedBooks[this.account.id] = bookName;
            return bookName;
        } catch (e) {
            console.error(e);
        }
    }

    // handle new selected book, updating controls and saving selected book for each account
    async selectBook(bookName = undefined) {
        try {
            if (verbose) {
                console.debug("booksTab.selectBook:", bookName);
            }
            if (bookName === undefined) {
                bookName = this.selectedBook();
            }
            this.selectedBooks[this.account.id] = bookName;
            this.controls.bookSelect.selectedIndex = this.booksIndex[bookName];
        } catch (e) {
            console.error(e);
        }
    }

    async populateDropdown(control, items) {
        try {
            control.innerHTML = "";
            for (const text of items) {
                let label = document.createElement("a");
                label.classList.add("dropdown-item");
                label.setAttribute("href", "#");
                label.textContent = text;
                control.appendChild(label);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async populateAddSenderTarget(bookName = undefined) {
        try {
            if (bookName === undefined) {
                let response = await this.sendMessage({ id: "getAddSenderTarget", accountId: this.account.id });
                bookName = response.result;
            }
            this.controls.addSenderSpan.innerHTML = " " + bookName + " ";
        } catch (e) {
            console.error(e);
        }
    }

    async populateConnections() {
        try {
            if (this.tableRowTemplate === undefined) {
                let rows = this.controls.tableBody.getElementsByTagName("tr");
                this.tableRowTemplate = rows[0];
                console.log("tableRowTemplate:", this.tableRowTemplate);
                this.controls.tableBody.innerHTML = "";
            }
            if (!this.isConnectionsExpanded()) {
                return;
            }
            await this.scanConnectedBooks();
            this.controls.tableBody.innerHTML = "";
            for (const cxn of this.connectedBooks[this.account.id]) {
                let row = document.createElement("tr");

                //this.controls.tableBody.appendChild(this.tableRowTemplate);
                //let row = this.controls.tableBody.lastChild;
                //console.log("row:", cxn, row.childNodes);
                let templateCells = this.tableRowTemplate.getElementsByTagName("td");
                let cell0 = document.createElement("td");
                cell0.innerHTML = templateCells[0].innerHTML;
                row.appendChild(cell0);

                let cell1 = document.createElement("td");
                cell1.innerHTML = templateCells[1].innerHTML;
                row.appendChild(cell1);

                this.controls.tableBody.appendChild(row);

                let labels = row.getElementsByTagName("label");
                let check = row.getElementsByTagName("input")[0];
                labels[0].textContent = cxn.name;
                if (cxn.type === "connection") {
                    labels[1].textContent = cxn.token;
                    check.checked = true;
                } else {
                    labels[1].textContent = "";
                    check.checked = false;
                }

                check.setAttribute("data-cxn-uuid", cxn.UID);
                check.addEventListener("click", this.handlers.ConnectionChanged);
            }
            /*
            this.controls.connectionsSelect.innerHTML = "";
            let connections = this.connectedBooks[account.id];
            for (const cxn of Object.values(connections)) {
                const row = document.createElement("option");
                row.textContent = cxn.name;
                this.controls.connectionsSelect.appendChild(row);
            }
	    */
        } catch (e) {
            console.error(e);
        }
    }

    isConnectionsExpanded() {
        try {
            const expanded = this.controls.connectionsDropdown.getAttribute("aria-expanded") === "true";
            console.log("isConnectionsExpanded returning:", expanded);
            return expanded;
        } catch (e) {
            console.error(e);
        }
    }

    async saveChanges() {
        try {
            if (verbose) {
                console.log("books tab save changes");
            }
            // books tab has no pending state
            return { succes: true };
        } catch (e) {
            console.error(e);
        }
    }

    //////////////////////////////////////////////////////
    //
    // carddav connection management
    //
    //////////////////////////////////////////////////////

    //////////////////////////////////////////////////////////////////////////
    //
    // list cardDAV books available for account
    //
    //////////////////////////////////////////////////////////////////////////

    async scanServerBooks(force = false) {
        try {
            if (force) {
                this.serverBooks[this.account.id] = undefined;
            }
            if (this.serverBooks[this.account.id] !== undefined) {
                return;
            }
            this.serverBooks[this.account.id] = [];
            const username = accountEmailAddress(this.account);
            const password = await this.getCardDAVPassword(this.account);
            this.setStatus("Scanning CardDAV server books...");
            console.log("calling cardDAV.list...");
            let books = await messenger.cardDAV.list(username, password);
            console.log("cardDAV.list returned:", books);
            this.setStatus("CardDAV server scan complete");
            for (const book of books) {
                let account = this.accountIndex[book.username];
                if (this.serverBooks[account.id] === undefined) {
                    this.serverBooks[account.id] = [];
                }
                book.UID = generateUUID();
                this.serverBooks[account.id].push(book);
            }
        } catch (e) {
            console.error(e);
        }
    }

    //
    // list connected cardDAV books in address books
    //

    // scan connected books for all accounts
    async scanConnectedBooks(force = false) {
        try {
            if (verbose) {
                console.debug("scanConnectedBooks:", force);
            }

            if (force) {
                this.connectedBooks[this.account.id] = undefined;
            }

            if (this.connectedBooks[this.account.id] !== undefined) {
                return;
            }

            this.connectedBooks = {};
            for (const accountId of Object.keys(this.accounts)) {
                this.connectedBooks[accountId] = [];
            }

            this.setStatus("Scanning Address Book CardDAV connections...");
            console.log("calling cardDAV.connected...");
            const connected = await messenger.cardDAV.connected();
            console.log("cardDAV.connected returned:", connected);
            this.setStatus("Address Book CardDAV scan complete");

            let found = {};

            for (const cxn of connected) {
                let account = this.accountIndex[cxn.username];
                this.connectedBooks[account.id].push(cxn);
                found[cxn.name] = true;
            }

            for (const bookName of this.books.names()) {
                if (found[bookName] !== true) {
                    await this.scanServerBooks();
                    for (const cxn of this.serverBooks[this.account.id]) {
                        if (cxn.name == bookName) {
                            this.connectedBooks[this.account.id].push(cxn);
                        }
                    }
                }
            }
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

    async isConnectedBook(bookName) {
        try {
            await this.scanConnectedBooks();
            let connected = false;
            for (const cxn of this.connectedBooks[this.account.id]) {
                if (cxn.name === bookName && cxn.type === "connection") {
                    connected = true;
                    break;
                }
            }
            console.log("isConnectedBook:", bookName, connected);
            return connected;
        } catch (e) {
            console.error(e);
        }
    }

    async connectBook(cxn) {
        try {
            let bookName = cxn.name;
            let connected = await this.isConnectedBook(bookName);
            if (connected === true) {
                this.setStatus("FilterBook " + bookName + "is already connected");
            } else {
                console.assert(cxn.type === "listing");
                this.setStatus("Connecting FilterBook " + bookName + "...");
                const username = accountEmailAddress(this.account);
                const password = await this.getCardDAVPassword(this.account);
                await this.scanServerBooks();
                let token = undefined;
                for (const cxn of this.serverBooks[this.account.id]) {
                    if (cxn.name === bookName) {
                        token = cxn.token;
                        break;
                    }
                }
                if (token === undefined) {
                    console.error("connectBook: bookName not found:", bookName, this.serverBooks[this.account.id]);
                    this.setStatus("FilterBook '" + bookName + "' not found on cardDAV server");
                    return;
                }

                console.log("calling cardDAV.connect:", username, password, token);
                let result = await messenger.cardDAV.connect(username, password, token);
                console.log("connectBook: cardDAV.connect returned:", result);

                this.setStatus("FilterBook " + result.token + " added to Address Books");

                return true;
            }
            return false;
        } catch (e) {
            console.error(e);
        }
    }

    async disconnectBook(cxn) {
        try {
            if (verbose) {
                console.debug("disconnectBook:", cxn);
            }
            console.log("calling cardDAV.disconnect:", cxn.URI);
            let result = await messenger.cardDAV.disconnect(cxn.URI);
            console.log("cardDAV.disconnect returned:", result);
        } catch (e) {
            console.error(e);
        }
    }

    async disconnectAllBooks() {
        try {
            if (verbose) {
                console.debug("disconnectAllBooks");
            }
            await this.scanConnectedBooks();
            let count = 0;
            for (const cxn of this.account.connectedBooks[this.account.id]) {
                count++;
                await this.disconnectBook(cxn);
            }
            console.log("disconnected:", count);
            if (count > 0) {
                await this.scanConnectedBooks(true);
                await this.populateConnections();
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

    validateBookName(bookName) {
        try {
            let catcher = { errors: [] };
            const validated = validateBookName(bookName, catcher);
            for (const error of catcher.errors) {
                this.setStatus("Add Disabled: " + error);
                return false;
            }
            this.setStatus("Ready to Add: " + validated);
            return validated;
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
            bookName = this.validateBookName(bookName);
            if (bookName === false) {
                return;
            }
            // we may be deleting the selected book
            if (bookName === this.selectedBook()) {
                this.selectedBooks[this.account.id] = undefined;
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
            const bookName = this.booksIndex[index];
            if (verbose) {
                console.debug("onBookSelectChange:", index, bookName, sender.target.id);
            }
            await this.selectBook(bookName);
        } catch (e) {
            console.error(e);
        }
    }

    // switch to connect/disconnect current book cardDAV address book connection
    async onConnectionChanged(sender) {
        try {
            if (verbose) {
                console.log("onConnectionChanged:", sender.target.checked, sender);
            }
            let uuid = sender.target.getAttribute("data-cxn-uuid");
            for (const cxn of this.connectedBooks[this.account.id]) {
                if (cxn.UID === uuid) {
                    if (sender.target.checked) {
                        console.log("connect:", sender.target, cxn);
                        await this.connectBook(cxn);
                    } else {
                        console.log("disconnect:", sender.target, cxn);
                        await this.disconnectBook(cxn);
                    }
                }
            }
            await this.scanConnectedBooks(true);
            await this.populateConnections();
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
            await this.scanConnectedBooks(true);
        } catch (e) {
            console.error(e);
        }
    }

    async onConnectionsDropdownChange() {
        try {
            let expanded = this.isConnectionsExpanded();
            if (verbose) {
                console.log("onConnectionsDropdownChange:", expanded);
            }
            if (expanded) {
                this.controls.connectionsDropdown.textContent = "Hide Connections";
                this.populateConnections();
            } else {
                this.controls.connectionsDropdown.textContent = "Show Connections";
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onAddressesClick() {
        try {
            if (verbose) {
                console.log("onAddressesClick");
            }
            this.populateDropdown(this.controls.addressesMenu, this.books.addresses(this.selectedBook()));
        } catch (e) {
            console.error(e);
        }
    }

    async onAddSenderClick() {
        try {
            if (verbose) {
                console.log("onAddSenderClick");
            }
            this.populateDropdown(this.controls.addSenderMenu, this.books.names());
        } catch (e) {
            console.error(e);
        }
    }

    // select current book as account 'add sender' target
    async onAddSenderMenuClick(sender) {
        try {
            if (verbose) {
                console.log("onAddSenderMenuClick:", sender, sender.target.textContent);
            }
            const bookName = sender.target.textContent;
            this.populateAddSenderTarget(bookName);
            await this.sendMessage({
                id: "setAddSenderTarget",
                accountId: this.account.id,
                bookName: bookName,
            });
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

    async onAddInputKeyup() {
        try {
            this.validateBookName(this.controls.addInput.value.trim());
            this.enableAddButton();
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

    async onDeleteInputKeyup() {
        try {
            this.enableDeleteButton();
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
