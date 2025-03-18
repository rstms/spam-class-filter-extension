/* globals console, messenger */

const verbose = false;

export class HelpTab {
    constructor(sendMessage) {
        this.controls = {};
        this.sendMessage = sendMessage;
    }
    async populate(helpLines) {
        try {
            const manifest = await messenger.runtime.getManifest();
            var text = "";
            for (var line of helpLines) {
                if (verbose) {
                    console.log("line: ", "'" + line + "'");
                }
                line = line.replace(/^\s*/, "");
                line = line.replace(/\s*$/, "");
                line = line.replace(/^##+\s*/g, "<b>");
                line = line.replace(/^#+\s*/g, "<br><br><b>");
                line = line.replace(/\s*##+$/g, "  v" + manifest.version + "</b><br>");
                line = line.replace(/\s*#+$/g, "</b><br>");
                text += " " + line + "\n";
                if (verbose) {
                    console.log("line: ", "'" + line + "'");
                    console.log("---");
                }
            }
            if (verbose) {
                console.debug(text);
            }
            this.controls.helpText.innerHTML = text;
        } catch (e) {
            console.error(e);
        }
    }
}
