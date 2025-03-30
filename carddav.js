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
                async connected() {
                    console.log("connected");
                    //console.log("abManager:", abManager);
                    console.log("context:", context);
                    let books = [];
                    for (const dir of abManager.directories) {
                        console.log(dir);
                        if (dir.dirType === abManager.CARDDAV_DIRECTORY_TYPE) {
                            books.push(dir);
                            /*
			    books.push({
				UID: dir.UID,
				URI: dir.URI,
				name: dir.dirName,
				description: dir.description,
				fileName: dir.fileName,
				useForAutoComplete: dir.useForAutoComplete(),
				serverURL: dir.getStringValue("carddav.url", ""),
				username: dir.getStringValue("carddav.username", ""),
				
			    });
			    */
                        }
                        console.log("connected returning:", books);
                    }
                    return books;
                },
                async list(username, password) {
                    console.log("list:", username, password);
                    let hostname = "https://" + username.split("@")[1];
                    let books = await CardDAVUtils.detectAddressBooks(username, password, hostname, false);
                    console.log("list returning:", books);
                    return books;
                },
                async connect(username, password, name, description) {
                    console.log("connect:", username, password, name, description);
                    let hostname = "https://" + username.split("@")[1];
                    let books = await CardDAVUtils.detectAddressBooks(username, password, hostname, false);
                    let created = undefined;
                    for (const book of books) {
                        if (book.name === name) {
                            console.log("connect: creating:", book);
                            created = await book.create();
                            break;
                        }
                    }
                    console.log("connectreturning:", created);
                    return created;
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
