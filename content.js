
async function getSystemTheme() {

    var systemTheme = {};

    console.log("getSystemTheme document:", document)

    const tempDiv = document.createElement("div");

    // Append the element to the document body to ensure we can compute styles
    document.body.appendChild(tempDiv);

    // Set the text content to get a font style
    tempDiv.innerText = "Testing Font";

    const tempButton = document.createElement("button");
    tempButton.textContent = "test";
    tempDiv.appendChild(tempButton);

    // Get computed styles
    systemTheme.divStyle = getComputedStyle(tempDiv);

    // Retrieve font properties
    systemTheme.buttonStyle = getComputedStyle(tempButton);

    // Remove the temporary element from the DOM
    document.body.removeChild(tempDiv);

    return systemTheme

}

//await browser.runtime.sendMessage({SpamFilterClassExtension: true, command: "systemThemeResult", theme: systemTheme});
//console.log("sendMessage failed:", error);
//await browser.runtime.sendMessage({SpamFilterClassExtension: true, command: "systemThemeFailed", error: error});

async function handleMessage(message, sender) {
    if (message.hasOwnProperty("SpamFilterClassExtension")) {
	if (message.command==="getSystemTheme") {
	    try {
		theme = await getSystemTheme();
		return {theme: theme, error: null};
	    } catch(error) { 
		return {theme: null, error: error};
	    }
	}
    }
}

async function handleLoad() {
    browser.runtime.onMessage.addListener(handleMessage);
    try {
	systemTheme = await getSystemTheme();
	try { 
	    await browser.runtime.sendMessage({SpamFilterClassExtension: true, command: "systemTheme", {theme: systemTheme, error: null});
	} catch(error) { 
	    console.log("sendMessage failed:", error);
	}
    } catch(error) { 
	console.log("getSystemTheme failed:", error);
    }
}

window.addEventListener("load", handleLoad);
