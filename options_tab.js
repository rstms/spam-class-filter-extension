import { differ, reloadExtension } from "./common.js";
import { config } from "./config.js";

/* globals document, console */
const verbose = true;

export class OptionsTab {
    constructor(sendMessage, handlers) {
        this.controls = {};
        this.pendingDomainConfig = {};
        this.domainCheckbox = {};
        this.sendMessage = sendMessage;
        this.handlers = handlers;
    }

    createDomainRow(index, domain, enabled) {
        try {
            const row = document.createElement("div");
            row.classList.add("form-check");
            row.id = "options-domain-row-" + index;
            //console.log("row", index, row);

            const checkbox = document.createElement("input");
            checkbox.id = "options-domain-checkbox-" + index;
            checkbox.type = "checkbox";
            checkbox.checked = enabled;
            checkbox.classList.add("form-check-input");
            checkbox.addEventListener("change", this.handlers.DomainCheckboxChange);
            row.appendChild(checkbox);
            //console.log("checkbox", index, checkbox);

            const label = document.createElement("label");
            label.id = "options-domain-label-" + index;
            label.classList.add("form-check-label");
            label.setAttribute("for", checkbox.id);
            label.textContent = domain;
            row.appendChild(label);
            //console.log("label", index, label);

            return { row: row, checkbox: checkbox };
        } catch (e) {
            console.error(e);
        }
    }

    async populate() {
        try {
            const autoDelete = await config.local.get("autoDelete");
            this.controls.autoDelete.checked = autoDelete ? true : false;

            const advancedTabVisible = await config.local.get("advancedTabVisible");
            this.controls.advancedTabVisible.checked = advancedTabVisible ? true : false;

            const minimizeCompose = await config.local.get("minimizeCompose");
            this.controls.minimizeCompose.checked = minimizeCompose ? true : false;

            await this.populateDomains();
        } catch (e) {
            console.error(e);
        }
    }

    async populateDomains() {
        try {
            if (verbose) {
                console.log("BEGIN populateOptionsAccounts");
            }

            this.showDomainsButtons(false);

            // get domains from background page
            const configDomains = await this.sendMessage({ id: "getAccountDomains" });
            const activeDomains = await this.sendMessage({ id: "getActiveDomains" });
            console.log({ configDomains: configDomains, activeDomains: activeDomains });

            var stack = this.controls.domainsStack;
            stack.innerHTML = "";
            this.domainCheckbox = {};
            this.pendingDomainConfig = {};
            var index = 0;
            for (const domain of Object.keys(configDomains).sort()) {
                const enabled = activeDomains[domain] ? true : false;
                console.log(index, domain, enabled);
                const created = await this.createDomainRow(index, domain, enabled);
                this.pendingDomainConfig[domain] = enabled;
                this.domainCheckbox[created.checkbox.id] = {
                    control: created.checkbox,
                    id: created.checkbox.id,
                    domain: domain,
                };
                stack.appendChild(created.row);
                index += 1;
            }
            await this.updateDomainsApplyButton();

            if (verbose) {
                console.log("END populateOptionsAccounts");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async updateDomainsApplyButton() {
        try {
            const accountDomains = await this.sendMessage({ id: "getAccountDomains" });
            const dirty = differ(this.pendingDomainConfig, accountDomains);
            console.log("updateDomainsApplyButton:", {
                dirty: dirty,
                pending: this.pendingDomainConfig,
                account: accountDomains,
            });
            this.showDomainsButtons(dirty);
        } catch (e) {
            console.error(e);
        }
    }

    showDomainsButtons(visible) {
        try {
            this.controls.domainsApplyButton.disabled = !visible;
            this.controls.domainsApplyButton.hidden = !visible;
            this.controls.domainsCancelButton.disabled = !visible;
            this.controls.domainsCancelButton.hidden = !visible;
        } catch (e) {
            console.error(e);
        }
    }

    async onDomainsApplyClick() {
        try {
            const accountDomains = await this.sendMessage({ id: "getAccountDomains" });
            if (differ(this.pendingDomainConfig, accountDomains)) {
                await this.sendMessage({ id: "setActiveDomains", domains: this.pendingDomainConfig });
                await reloadExtension();
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onDomainCheckboxChange(sender) {
        try {
            console.log("onDomainCheckboxChange:", sender);
            const domain = this.domainCheckbox[sender.target.id].domain;
            const enabled = sender.target.checked;
            this.pendingDomainConfig[domain] = enabled;
            await this.updateDomainsApplyButton();
        } catch (e) {
            console.error(e);
        }
    }

    async onAutoDeleteChange() {
        try {
            await config.local.set("autoDelete", this.controls.autoDelete.checked);
        } catch (e) {
            console.error(e);
        }
    }

    async onShowAdvancedTabChange() {
        try {
            await config.local.set("advancedTabVisible", this.controls.advancedTabVisible.checked);
        } catch (e) {
            console.error(e);
        }
    }

    async onMinimizeComposeChange() {
        try {
            await config.local.set("minimizeCompose", this.controls.minimizeCompose.checked);
        } catch (e) {
            console.error(e);
        }
    }

    async onResetClick() {
        try {
            const optInApproved = await config.local.get("optInApproved");
            await config.local.reset();
            await config.local.set("optInApproved", optInApproved ? true : false);
            await reloadExtension();
        } catch (e) {
            console.error(e);
        }
    }
}
