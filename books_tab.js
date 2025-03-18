/* globals console */

export class BooksTab {
    constructor(sendMessage) {
        this.controls = {};
        this.sendMessage = sendMessage;
    }

    async enableControls(enabled) {
        try {
            await this.enableBooksControls(enabled);
            await this.enableAddressesControls(enabled);
            if (!enabled) {
                await this.enableButtons(false, false, false);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async enableButtons(apply, cancel, ok) {
        try {
            this.controls.applyButton.disabled = !apply;
            this.controls.cancelButton.disabled = !cancel;
            this.controls.okButton.disabled = !ok;
        } catch (e) {
            console.error(e);
        }
    }

    async enableBooksControls(enabled) {
        try {
            this.controls.booksAddButton.disabled = !enabled;
            this.controls.booksDeleteButton.disabled = !enabled;
            this.controls.booksInput.disabled = !enabled;
        } catch (e) {
            console.error(e);
        }
    }

    async enableAddressesControls(enabled) {
        try {
            this.controls.addrsAddButton.disabled = !enabled;
            this.controls.addrsDeleteButton.disabled = !enabled;
            this.controls.addrsInput.disabled = !enabled;
        } catch (e) {
            console.error(e);
        }
    }

    async populate() {
        try {
            console.log("populateBooks");
            await this.enableControls(false);
        } catch (e) {
            console.error(e);
        }
    }

    async onApplyClick() {
        try {
            await this.saveChanges();
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
}
