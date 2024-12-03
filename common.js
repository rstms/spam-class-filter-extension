export function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0; // Generate a random number between 0 and 15
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); // Convert to hexadecimal
    });
}

export function domainPart(text) {
    return text.split("@")[1];
}
