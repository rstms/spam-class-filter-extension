/* global console, ChromeUtils, Components, CardDAVUtils */

var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

ChromeUtils.defineESModuleGetters(this, {
    CardDAVUtils: "resource:///modules/CardDAVUtils.sys.mjs",
});

var FleemBleem = "HEREITIS";

var abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);

var cardDAV = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        return {
            cardDAV: {
                async connected() {
                    console.log("connected");
                    console.log("fleem", FleemBleem);
                    //console.log("abManager:", abManager);
                    console.log("context:", context);
                    let books = [];
                    for (const dir of abManager.directories) {
                        console.log(dir);
                        if (dir.dirType === abManager.CARDDAV_DIRECTORY_TYPE) {
                            let username = dir.getStringValue("carddav.username", "");
                            let serverURL = dir.getStringValue("carddav.url", "");
                            let token = this.pathToken(serverURL);
                            books.push({
                                UID: dir.UID,
                                URI: dir.URI,
                                name: dir.dirName,
                                description: dir.description,
                                fileName: dir.fileName,
                                serverURL: serverURL,
                                username: username,
                                token: token,
                                type: "connection",
                            });
                        }
                    }
                    console.log("connected returning:", books);
                    return books;
                },
                pathToken(path) {
                    let parts = path.split("/");
                    return parts[parts.length - 2];
                },
                hostname(username) {
                    return "https://" + username.split("@")[1];
                },
                async list(username, password) {
                    console.log("list:", username, password);
                    let books = await CardDAVUtils.detectAddressBooks(username, password, this.hostname(username), false);
                    let result = [];
                    for (const book of books) {
                        let token = this.pathToken(book.url.pathname);
                        result.push({
                            name: book.name,
                            username: username,
                            hostname: book.url.host,
                            href: book.url.href,
                            origin: book.url.origin,
                            pathname: book.url.pathname,
                            token: token,
                            type: "listing",
                        });
                    }
                    console.log("list returning:", result);
                    return result;
                },
                async connect(username, password, token) {
                    console.log("connect:", username, password, token);
                    let books = await CardDAVUtils.detectAddressBooks(username, password, this.hostname(username), false);
                    for (let book of books) {
                        let bookToken = this.pathToken(book.url.pathname);
                        if (bookToken === token) {
                            const connection = await book.create();
                            console.log("connection:", connection);
                            return { success: true, connection: connection };
                        }
                    }
                    return { success: false, error: "book not found" };
                },

                /*
			const bookId = generateUID();
                        console.log("davBook:", davBook);
			const book = abManager.newAddressBook(username+"-"+davBook.name, davBook.urlURI, abManager.CARDDAV_DIRECTORY_TYPE, bookId);
			console.log("book:", book);
			let directory = abManager.getDirectoryFromUID(bookId);
			console.log("directory:", directory);
			let uret = directory.setStringValue("username", username);
			console.log("set username:", uret);
			let pret = directory.setStringValue("password", password);
			console.log("set password:", pret);
			console.log(book);
			console.log("directory.QueryInterface:", directory.QueryInterface());
			const syncReturn = directory.sync();
			console.log("sync:", syncReturn);
		    */
                async disconnect(uri) {
                    console.log("disconnect:", uri);
                    let ret = abManager.deleteAddressBook(uri);
                    console.log("disconnect returning:", ret);
                    return ret;
                },
                async get(uri) {
                    console.log("get:", uri);
                    let book = abManager.getDirectory(uri);
                    console.log("get returning:", book);
                    return;
                },
            },
        };
    }
};

console.log("cardDAV:", cardDAV);
