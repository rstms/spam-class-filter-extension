export function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0; // Generate a random number between 0 and 15
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); // Convert to hexadecimal
    });
}

export function domainPart(text) {
    return text.split("@")[1];
}

export function differ(original, current) {
    try {
        if (original === current) {
            return false;
        }
        if (original == null || current == null || typeof original !== "object" || typeof current !== "object") {
            return true;
        }

        const originalKeys = Object.keys(original);
        const currentKeys = Object.keys(current);

        if (originalKeys.length !== currentKeys.length) {
            return true;
        }

        for (const key of originalKeys) {
            if (!current.hasOwnProperty(key)) {
                return true;
            }

            const originalValue = original[key];
            const currentValue = current[key];

            if (Array.isArray(originalValue) && Array.isArray(currentValue)) {
                if (
                    originalValue.length !== currentValue.length ||
                    originalValue.some((item, index) => differ(item, currentValue[index]))
                ) {
                    return true;
                }
            } else if (typeof OriginalValue === "object" || typeof currentValue === "object") {
                if (differ(originalValue, currentValue)) {
                    return true;
                }
            } else if (originalValue !== currentValue) {
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error(e);
    }
}
