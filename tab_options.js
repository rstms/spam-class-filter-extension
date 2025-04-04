//
// tab_options
//

import { differ, verbosity } from "./common.js";
import { config } from "./config.js";

/* globals document, console, messenger */
const verbose = verbosity.tab_options;

export class OptionsTab {
    constructor(sendMessage, handlers) {
        this.controls = {};
        this.pendingDomainConfig = {};
        this.domainCheckbox = {};
        this.sendMessage = sendMessage;
        this.handlers = handlers;
        this.account = undefined;
    }

    async selectAccount(account) {
        try {
            this.account = account;
        } catch (e) {
            console.error(e);
        }
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
            this.controls.autoDelete.checked = await config.local.getBool(config.key.autoDelete);
            this.controls.advancedTabVisible.checked = await config.local.getBool(config.key.advancedTabVisible);
            this.controls.minimizeCompose.checked = await config.local.getBool(config.key.minimizeCompose);
            this.controls.cacheResponses.checked = await config.local.getBool(config.key.filterctlCacheEnabled);

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
            const configDomains = await this.sendMessage({ id: "getDomains" });
            const enabledDomains = await this.sendMessage({ id: "getEnabledDomains" });
            console.log({ configDomains: configDomains, enabledDomains: enabledDomains });

            var stack = this.controls.domainsStack;
            stack.innerHTML = "";
            this.domainCheckbox = {};
            this.pendingDomainConfig = {};
            var index = 0;
            for (const domain of Object.keys(configDomains).sort()) {
                const enabled = enabledDomains[domain] ? true : false;
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
            const accountDomains = await this.sendMessage({ id: "getDomains" });
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
            const accountDomains = await this.sendMessage({ id: "getDomains" });
            if (differ(this.pendingDomainConfig, accountDomains)) {
                await this.sendMessage({ id: "setDomains", domains: this.pendingDomainConfig });
                await this.reloadExtension();
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
            await config.local.setBool(config.key.autoDelete, this.controls.autoDelete.checked);
        } catch (e) {
            console.error(e);
        }
    }

    async onShowAdvancedTabChange() {
        try {
            await config.local.setBool(config.key.advancedTabVisible, this.controls.advancedTabVisible.checked);
        } catch (e) {
            console.error(e);
        }
    }

    async onMinimizeComposeChange() {
        try {
            await config.local.setBool(config.key.minimizeCompose, this.controls.minimizeCompose.checked);
        } catch (e) {
            console.error(e);
        }
    }

    async reloadExtension() {
        try {
            await config.local.setBool(config.key.reloadAutoOpen, true);
            await messenger.runtime.reload();
        } catch (e) {
            console.error(e);
        }
    }

    async onResetClick() {
        try {
            const approved = await config.local.getBool(config.key.optInApproved);
            await config.local.reset();
            await config.local.setBool(config.key.optInApproved, approved);
            await this.reloadExtension();
        } catch (e) {
            console.error(e);
        }
    }

    async onClearCacheClick() {
        try {
            await this.sendMessage({ id: "cacheControl", command: "clear" });
        } catch (e) {
            console.error(e);
        }
    }

    async onCacheResponsesChange() {
        try {
            let enabled = this.controls.cacheResponses.checked;
            await config.local.setBool(config.key.filterctlCacheEnabled, enabled);
            const command = enabled ? "enable" : "disable";
            await this.sendMessage({ id: "cacheControl", command: command });
        } catch (e) {
            console.error(e);
        }
    }
}
