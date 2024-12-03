async function onOptionsSave(event) {
    console.log("options saved clicked:", event);
    var useEmail = document.getElementById("options-use-email");
    console.log("options-use-email:", useEmail);
}

document.getElementById("options-save-button").addEventListener("click", onOptionsSave);
