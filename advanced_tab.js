/* globals document, console, */

const verbose = false;

export class AdvancedTab {
    constructor(sendMessage) {
        this.selectedAccountId = undefined;
        this.controls = {};
        this.sendMessage = sendMessage;
        this.commandUsage = {};
    }
    setOutput(text) {
        try {
            const output = this.controls.output;
            output.style.height = "0px";
            output.value = text;
            output.style.height = `${output.scrollHeight + 10}px`;
        } catch (e) {
            console.error(e);
        }
    }

    async populate(commandLines) {
        try {
            this.enableControls(false);
            this.controls.command.innerHTML = "";
            if (verbose) {
                console.log("Commands:", commandLines);
            }
            var flag = false;
            this.commandUsage = {};
            var firstUsage = null;
            var command = null;
            var usage = [];
            for (var line of commandLines) {
                if (line.substr(0, 4) === "----") {
                    flag = true;
                } else {
                    if (flag) {
                        if (command) {
                            this.commandUsage[command] = usage;
                            if (!firstUsage) {
                                firstUsage = usage;
                            }
                        }
                        usage = [];
                        console.log("line:", line);
                        command = line.split(" ")[0];
                        if (command.length) {
                            const option = document.createElement("option");
                            option.textContent = command;
                            this.controls.command.appendChild(option);
                        } else {
                            command = null;
                        }
                        flag = false;
                    }
                    usage.push(line);
                }
            }
            console.log("commandUsage:", this.commandUsage);
            this.setOutput(firstUsage.join("\n"));
            this.enableControls(true);
        } catch (e) {
            console.error(e);
        }
    }

    enableControls(enabled) {
        try {
            this.controls.command.disabled = !enabled;
            this.controls.argument.disabled = !enabled;
            this.controls.sendButton.disabled = !enabled;
        } catch (e) {
            console.error(e);
        }
    }

    async onCommandChange(sender) {
        try {
            console.log("advanced command select changed:", sender);
            const index = this.controls.command.selectedIndex;
            const command = this.controls.command.value;
            console.log("command:", index, command);
            this.controls.output.innerHTML = "";
            var lines = this.commandUsage[command];
            console.log(lines);
            this.setOutput(lines.join("\n"));
        } catch (e) {
            console.error(e);
        }
    }

    async onSendClick() {
        try {
            const message = {
                id: "sendCommand",
                accountId: this.selectedAccountId,
                command: this.controls.command.value,
                argument: this.controls.argument.value,
            };
            this.setOutput(JSON.stringify(message, null, 2) + "\n\nAwaiting filterctl response...");
            const response = await this.sendMessage(message);
            if (verbose) {
                console.debug("response:", response);
            }
            if (response == undefined) {
                this.setOutput("Error: server communication failed");
            } else {
                this.setOutput(JSON.stringify(response, null, 2));
            }
        } catch (e) {
            console.error(e);
        }
    }
}
