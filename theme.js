export async function getSystemTheme() {
    console.log("getSystemTheme document:", document);

    const tempDiv = document.createElement("div");
    var systemTheme = {};

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

    return systemTheme;
}
