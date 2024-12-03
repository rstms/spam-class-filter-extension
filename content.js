async function getSystemTheme() {
    var systemTheme = {};

    const tempDiv = document.createElement("div");

    // Append the element to the document body to ensure we can compute styles
    document.body.appendChild(tempDiv);

    // Set the text content to get a font style
    tempDiv.innerText = "Testing Font";

    const tempButton = document.createElement("button");
    tempButton.textContent = "test";
    tempDiv.appendChild(tempButton);

    // Retrieve font properties
    //systemTheme.buttonStyle = window.getComputedStyle(tempButton);

    // Get computed styles
    systemTheme.divStyle = window.getComputedStyle(tempDiv);

    // Remove the temporary element from the DOM
    await document.body.removeChild(tempDiv);

    return systemTheme;
}

var port = null;

async function handlePortMessage(message, sender) {
    try {
        switch (message.id) {
            case "ping":
                await sender.postMessage({ id: "pong", src: "content" });
                break;
            case "getSystemTheme":
                var theme;
                try {
                    theme = await browser.theme.getCurrent();
                    //theme = await getSystemTheme();
                    sender.postMessage({
                        id: "getSystemThemeResponse",
                        systemTheme: theme,
                        responseId: message.requestId,
                    });
                } catch (e) {
                    //var consoleText = JSON.stringify(window.console, null, 2);
                    sender.postMessage({
                        id: "getSystemThemeResponse",
                        systemTheme: {},
                        error: e,
                        responseId: message.requestId,
                    });
                }
                break;
        }
    } catch (e) {
        console.error(e);
    }
}

async function connectToBackground() {
    try {
        port = await browser.runtime.connect({ name: "content" });
        port.onMessage.addListener(handlePortMessage);
        //await port.postMessage({ id: "ping", source: "content" });
    } catch (e) {
        console.error(e);
    }
}

connectToBackground();
