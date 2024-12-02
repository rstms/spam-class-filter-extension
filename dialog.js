
// Function to open a popup and await user feedback
async function awaitPopup(windowName, args={}) {
    async function popupPrompt(popupId, defaultResponse) {
	try {
	    await messenger.windows.get(popupId);
	} catch (e) {
            // Window does not exist, assume closed.
            return defaultResponse;
	}
	return new Promise(resolve => {
            let response = defaultResponse;

	    function windowRemoveListener(closedId) {
		if (popupId == closedId) {
		    messenger.windows.onRemoved.removeListener(windowRemoveListener);
		    messenger.runtime.onMessage.removeListener(messageListener);
                    resolve(response);
		}
	    }

	    function messageListener(request, sender, sendResponse) {
		console.log("awaitPopup[" + popupId + "] messageListener:", request, sender, sendResponse);
		if (sender.tab.windowId != popupId) {
		    console.log("awaitPopup sender id mismatch:", sender.tab.windowId);
                } else if (request.popupResponse) {
                    response = request.popupResponse;
		}
	    }
	    messenger.runtime.onMessage.addListener(messageListener);
	    messenger.windows.onRemoved.addListener(windowRemoveListener);
	});
    }

    let window = await messenger.windows.create({
	url: windowName + ".html",
	type: "popup",
	height: 280,
        width: 390,
        allowScriptsToClose: true,
    });

    // Wait for the popup to be closed and define a default return value if the
    // window is closed without clicking a button.
    let rv = await popupPrompt(window.id, "cancel");
    console.log(rv);
    return rv; 
}
