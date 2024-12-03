/*
function getSystemTheme() {
    var theme = {};

    const tempDiv = document.createElement("div");

    // Append the element to the document body to ensure we can compute styles
    document.body.appendChild(tempDiv);

    // Set the text content to get a font style
    tempDiv.innerText = "Testing Font";

    const tempButton = document.createElement("button");
    tempButton.textContent = "test";
    tempDiv.appendChild(tempButton);

    // Retrieve font properties
    const buttonStyle = window.getComputedStyle(tempButton);
    theme.button = {};

    theme.button.fontFamily = buttonStyle.fontFamily;
    theme.button.fontSize = buttonStyle.fontSize;
    theme.button.fontWeight = buttonStyle.fontWeight;
    theme.button.color = buttonStyle.color;
    theme.button.backgroundColor = buttonStyle.backgroundColor;
    theme.button.margin = buttonStyle.margin;
    theme.button.padding = buttonStyle.padding;
    theme.button.border = buttonStyle.border;
    theme.button.borderRadius = buttonStyle.borderRadius;

    // Get computed styles
    const style = window.getComputedStyle(tempDiv);
    theme.div = {};
    theme.div.fontFamily = style.fontFamily;
    theme.div.fontSize = style.fontSize;
    theme.div.fontWeight = style.fontWeight;
    //theme.div.color = style.color;

    // Remove the temporary element from the DOM
    document.body.removeChild(tempDiv);

    return theme;
}

//getSystemTheme();
*/

var port = null;

async function handlePortMessage(message, sender) {
    try {
        switch (message.id) {
            case "ping":
                await sender.postMessage({ id: "pong", src: "tab" });
                break;
            case "getSystemTheme":
                try {
                    //var theme = await getSystemTheme();
                    var theme = { disabled: true };
                    sender.postMessage({
                        id: "getSystemThemeResponse",
                        systemTheme: theme,
                        responseId: message.requestId,
                    });
                } catch (e) {
                    sender.postMessage({
                        id: "getSystemThemeError",
                        error: e,
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
        port = await browser.runtime.connect({ name: "tab" });
        port.onMessage.addListener(handlePortMessage);
        await port.postMessage({ id: "ping", source: "tab" });
    } catch (e) {
        console.error(e);
    }
}

connectToBackground();
