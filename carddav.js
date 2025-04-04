/* global console, ChromeUtils, CardDAVUtils, MailServices, CryptoUtils  */

var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

ChromeUtils.defineESModuleGetters(this, {
    CardDAVUtils: "resource:///modules/CardDAVUtils.sys.mjs",
    MailServices: "resource:///modules/MailServices.sys.mjs",
    CryptoUtils: "resource://services-crypto/utils.sys.mjs",
});

var cardDAV = class extends ExtensionCommon.ExtensionAPI {
    getAPI() {
        return {
            cardDAV: {
                pathToken(path) {
                    let parts = path.split("/");
                    return parts[parts.length - 2];
                },
                tokenBook(email, token) {
                    return token.substring(email.length + 1);
                },
                hostname(username) {
                    return "https://" + username.split("@")[1];
                },
                book(dir) {
                    let username = dir.getStringValue("carddav.username", "");
                    let serverURL = dir.getStringValue("carddav.url", "");
                    let token = this.pathToken(serverURL);
                    let book = this.tokenBook(username, token);
                    return {
                        name: dir.dirName,
                        token: token,
                        book: book,
                        username: username,
                        url: serverURL,
                        uuid: dir.UID,
                        connected: true,
                        type: "connection",
                        detail: {
                            uri: dir.URI,
                            fileName: dir.fileName,
                            description: dir.description,
                            childCardCount: dir.childCardCount,
                            prefId: dir.prefId,
                            type: dir.type,
                            isMailList: dir.isMailList,
                            isRemote: dir.isRemote,
                            isSecure: dir.isSecure,
                            readOnly: dir.readOnly,
                            supportsMailingLists: dir.supportsMailingLists,
                        },
                    };
                },
                async connected() {
                    let books = [];
                    for (const dir of MailServices.ab.directories) {
                        if (dir.dirType === MailServices.ab.CARDDAV_DIRECTORY_TYPE) {
                            books.push(this.book(dir));
                        }
                    }
                    return books;
                },
                async generateHashUUID(url) {
                    /*
                    const hashArray = new Uint8Array(32);
                    for (let i = 0; i < 32; i++) {
                        hashArray[i] = parseInt(hashBuffer.substr(i * 2, 2), 16);
                    }
                    const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
		    */
                    const hex = await CryptoUtils.sha256(url);
                    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
                },
                async list(username, password) {
                    console.log("list:", username, password);
                    let books = [];
                    for (const book of await CardDAVUtils.detectAddressBooks(username, password, this.hostname(username), false)) {
                        console.log("list: book:", book);
                        let token = this.pathToken(book.url.pathname);
                        let uuid = await this.generateHashUUID(book.url.href + username);
                        // return the same root keys as a connected cardDAV directory
                        books.push({
                            name: book.name,
                            token: token,
                            book: this.tokenBook(username, token),
                            username: username,
                            url: book.url.href,
                            uuid: uuid,
                            connected: false,
                            type: "listing",
                            detail: {
                                hostname: book.url.host,
                                href: book.url.href,
                                origin: book.url.origin,
                                pathname: book.url.pathname,
                            },
                        });
                    }
                    console.log("list returning:", books);
                    return books;
                },
                async connect(username, password, token) {
                    console.log("connect:", username, password, token);
                    let result = {
                        username: username,
                        token: token,
                        connected: false,
                    };
                    let serverBook = undefined;
                    let books = await CardDAVUtils.detectAddressBooks(username, password, this.hostname(username), false);
                    console.log("connect: books:", books);
                    for (const book of books) {
                        let bookToken = this.pathToken(book.url.pathname);
                        if (bookToken === token) {
                            serverBook = book;
                            break;
                        }
                    }
                    if (serverBook === undefined) {
                        result.error = "token not found";
                        return result;
                    }
                    const cxn = await serverBook.create();

                    //FIXME: try a book that doesn't exist to see what failure returns

                    if (cxn._initialized !== true || typeof cxn._uid !== "string" || cxn._uid.length !== 36) {
                        result.error = "connection failed";
                        return result;
                    }
                    // read in the new directory and change the name to the token
                    let dir = MailServices.ab.getDirectoryFromUID(cxn._uid);
                    dir.dirName = token;
                    let book = this.book(dir);
                    return book;
                },
                async disconnect(uuid) {
                    let dir = MailServices.ab.getDirectoryFromUID(uuid);
                    let ret = MailServices.ab.deleteAddressBook(dir.URI);
                    //FIXME: see what to return here
                    console.log("disconnect returning:", ret);
                    return ret;
                },
                async get(uuid) {
                    console.log("get:", uuid);
                    let dir = MailServices.ab.getDirectoryFromUID(uuid);
                    console.log("get: dir:", dir);
                    let book = this.book(dir);
                    console.log("get: book:", book);
                    if (dir.dirType === MailServices.ab.CARDDAV_DIRECTORY_TYPE) {
                        book = this.book(dir);
                    } else {
                        book = {
                            uuid: uuid,
                            connected: false,
                            type: "error",
                            error: "not a cardDAV directory",
                        };
                    }
                    console.log("get returning:", book.user);
                    return book;
                },
            },
        };
    }
};

console.log("cardDAV:", cardDAV);
