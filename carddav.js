/* global console, ChromeUtils, Components, CardDAVUtils */

var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

ChromeUtils.defineESModuleGetters(this, {
    CardDAVUtils: "resource:///modules/CardDAVUtils.sys.mjs",
});

var abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);

var cardDAV = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        return {
            cardDAV: {
                async getBooks(populate) {
                    console.log("getBooks:", populate);
                    console.log("abManager:", abManager);
                    console.log("context:", context);
                    let names = [];
                    for (const dir of abManager.directories) {
                        console.log(dir);
                        if (dir.isRemote || dir.dirType === abManager.CARDDAV_DIRECTORY_TYPE) {
                            names.push({ name: dir.dirName, URI: dir.URI, UID: dir.UID });
                        }
                    }
                    return names;
                },
                async connect(name, URI, username, password) {
                    console.log("connect:", name, URI, username, password);
                    let hostname = "https://" + username.split("@")[1];
                    let books = await CardDAVUtils.detectAddressBooks(username, password, hostname, false);
                    console.log("detected cardDAV books:", books);
                    let connected = [];
                    for (const book of books) {
                        connected.push(await book.create());
                    }
                    console.log("connected:", connected);
                    return connected;
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
                },
                async disconnect(UID) {
                    console.log("disconnect:", UID);
                    return false;
                },

                async getAddresses(UID) {
                    console.log("getAddresses:", UID);
                    return [];
                },
                async addAddress(UID, address) {
                    console.log("addAddresses:", UID, address);
                    return false;
                },
                async deleteAddress(UID, address) {
                    console.log("addAddresses:", UID, address);
                    return false;
                },
            },
        };
    }
};

console.log("cardDAV:", cardDAV);
