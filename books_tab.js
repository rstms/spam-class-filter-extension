/* globals console */

export class BooksTab {
    constructor(sendMessage) {
        this.controls = {};
        this.sendMessage = sendMessage;
        this.accounts = undefined;
        this.selectedAccount = undefined;
    }

    async populate() {
        try {
            console.log("populateBooks");
            await this.enableControls(true);
        } catch (e) {
            console.error(e);
        }
    }

    async saveChanges() {
        try {
            console.log("books tab save changes");
        } catch (e) {
            console.error(e);
        }
    }

    async enableControls(enabled) {
        try {
            this.controls.accountSelect.disabled = !enabled;
        } catch (e) {
            console.error(e);
        }
    }
}
