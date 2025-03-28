import { selectedAccountId, accountEmailAddress } from "./common.js";
import { Classes, Level, classesFactory } from "./filterctl.js";

/* globals document, console, setTimeout, clearTimeout */

const verbose = true;
const dumpHTML = false;

const MIN_LEVELS = 2;
const MAX_LEVELS = 16;
const STATUS_PENDING_TIMEOUT = 5120;

export class ClassesTab {
    constructor(disableEditorControl, sendMessage, handlers) {
        this.controls = {};
        this.disableEditorControl = disableEditorControl;
        this.sendMessage = sendMessage;
        this.cellTemplate = null;
        this.handlers = handlers;
        this.selectedAccount = undefined;
        this.classes = undefined;
    }

    selectAccount(account) {
        try {
            this.selectedAccount = account;
        } catch (e) {
            console.error(e);
        }
    }

    async getClasses(disablePopulate = false, disableUpdateStatus = false) {
        try {
            if (verbose) {
                console.debug("ClassesTab.getClasses:", disablePopulate, disableUpdateStatus, this);
            }
            await this.setStatusPending("Requesting classes...");
            let response = await this.sendMessage({ id: "getClasses", accountId: this.selectedAccount.id });
            let classes = await this.handleResponse(response, disablePopulate, disableUpdateStatus);
            if (verbose) {
                console.debug("getClasses returning:", classes);
            }
            return classes;
        } catch (e) {
            console.error(e);
        }
    }

    async handleResponse(response, disablePopulate = false, disableUpdateStatus = false) {
        try {
            if (verbose) {
                console.log("handleResponse:", response);
            }

            let classes = response.classes;
            if (typeof classes !== "undefined") {
                if (typeof classes === "object") {
                    if (classes instanceof Classes) {
                        console.assert(classes instanceof Classes, "unexpected: classes IS an instance of Classes");
                    }
                    // parse message object into a Classes
                    console.assert(response.accountId === this.selectedAccount.id, "server response account ID mismatch");
                    classes = classesFactory(response.classes, this.selectedAccount);
                    console.warn("ClassesTab.handleResponse:", response.valid, classes.valid, classes, response);
                }
                response.classes = classes;
                console.assert(classes instanceof Classes, "classes is not an instance of Classes");

                if (!disablePopulate) {
                    await this.populate(classes);
                }
            }

            if (!disableUpdateStatus) {
                await this.updateStatus(response);
            }
            if (verbose) {
                console.debug("handleResponse: returning:", response.classes);
            }
            return response.classes;
        } catch (e) {
            console.error(e);
        }
    }

    getLevels(asClasses = false) {
        try {
            let i = 0;
            let classes = classesFactory();
            classes.setAccount(this.selectedAccount.id, accountEmailAddress(this.selectedAccount));
            console.log("getLevels: initialized classes:", classes);
            while (true) {
                const nameElement = document.getElementById(`level-name-${i}`);
                if (!nameElement) {
                    break;
                }
                const name = nameElement.value;
                const scoreElement = document.getElementById(`level-score-${i}`);
                const score = name === "spam" ? 999 : scoreElement.value;
                console.log("getLevels: adding:", i, name, score);
                classes.addLevel(name, score);
                i += 1;
            }
            try {
                classes.validate();
            } catch (e) {
                console.log(e);
            }
            let ret = asClasses ? classes : classes.render().Classes;
            console.debug("getLevels: returning:", ret);
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    async onTableChange(event) {
        try {
            if (verbose) {
                console.log("table change:", event);
            }
            await this.updateClasses();
        } catch (e) {
            console.error(e);
        }
    }

    async onCellDelete(event) {
        try {
            if (verbose) {
                console.log("cell delete");
            }
            const row = parseInt(event.srcElement.getAttribute("data-row"));
            let asClasses = true;
            var classes = this.getLevels(asClasses);
            classes.levels.splice(row, 1);
            await this.updateClasses(classes);
        } catch (e) {
            console.error(e);
        }
    }

    async onSliderMoved(event) {
        try {
            if (verbose) {
                console.log("slider moved");
            }
            const row = parseInt(event.srcElement.getAttribute("data-row"));
            let score = document.getElementById(`level-score-${row}`);
            score.value = event.srcElement.value;
            await this.updateClasses();
        } catch (e) {
            console.error(e);
        }
    }

    async onScoreChanged(event) {
        try {
            if (verbose) {
                console.log("score changed");
            }
            const row = parseInt(event.srcElement.getAttribute("data-row"));
            const slider = document.getElementById(`level-slider-${row}`);
            slider.value = `${event.srcElement.value}`;
            await this.updateClasses();
        } catch (e) {
            console.error(e);
        }
    }

    async onNameChanged() {
        try {
            if (verbose) {
                console.log("name changed");
            }
            await this.updateClasses();
        } catch (e) {
            console.error(e);
        }
    }

    newLevelName(levels) {
        try {
            let i = 0;
            while (true) {
                let name = `class${i}`;
                let found = false;
                for (let level of levels) {
                    if (level.name === name) {
                        found = true;
                    }
                }
                if (!found) {
                    return name;
                }
                i += 1;
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onCellInsert(event) {
        try {
            const row = parseInt(event.srcElement.getAttribute("data-row"));
            if (verbose) {
                console.log("cellInsert:", event, row);
            }
            let asClasses = true;
            let classes = this.getLevels(asClasses);
            let newScore = parseFloat(classes.levels[row].score);
            let nextScore = parseFloat(classes.levels[row + 1].score);
            if (nextScore === 999) {
                newScore += 1;
            } else {
                newScore += (nextScore - newScore) / 2;
            }
            classes.levels.splice(row + 1, 0, new Level(this.newLevelName(classes.levels), String(newScore)));
            await this.updateClasses(classes);
        } catch (e) {
            console.error(e);
        }
    }

    appendCell(row, index, id, control, text, disabled) {
        try {
            const cell = document.createElement("td");
            const element = document.createElement(control);
            if (control === "button") {
                element.textContent = text;
            } else {
                element.value = text;
            }
            for (const [key, value] of Object.entries(this.cellTemplate[id].attributes)) {
                element.setAttribute(key, value);
            }
            for (const value of this.cellTemplate[id].classes) {
                element.classList.add(value);
            }
            element.id = id + "-" + index;
            element.setAttribute("data-row", index);
            if (disabled) {
                element.disabled = true;
            }
            cell.appendChild(element);
            row.appendChild(cell);
            return element;
        } catch (e) {
            console.error(e);
        }
    }

    async initCellTemplate() {
        try {
            let cells = {
                "level-name": { id: "cell-class-input" },
                "level-score": { id: "cell-score-input" },
                "level-slider": { id: "cell-score-slider" },
                "level-delete": { id: "cell-add-button" },
                "level-insert": { id: "cell-delete-button" },
            };
            for (const key of Object.keys(cells)) {
                const el = document.getElementById(cells[key].id);
                if (verbose) {
                    console.log("cell:", key, el);
                }
                cells[key].attributes = {};
                cells[key].classes = [];
                for (const name of el.getAttributeNames()) {
                    switch (name) {
                        case "id":
                            break;
                        case "class":
                            break;
                        default:
                            cells[key].attributes[name] = el.getAttribute(name);
                            break;
                    }
                }
                for (const elClass of el.classList) {
                    cells[key].classes.push(elClass);
                }
            }
            cells["level-name"].attributes.rstmsKeyFilter = "name";
            cells["level-score"].attributes.rstmsKeyFilter = "score";
            //cells["level-slider"].classes.push("flex-fill");
            this.cellTemplate = cells;
            if (verbose) {
                console.log("cellTemplate:", this.cellTemplate);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async onInputKeypress(event) {
        try {
            const key = String.fromCharCode(event.which);
            const element = event.srcElement;
            const mode = element.getAttribute("rstmsKeyFilter");
            if (mode) {
                const value = element.value.trim();
                switch (mode) {
                    case "name":
                        if (value.length == 0) {
                            if (!/^[a-zA-Z]$/.test(key)) {
                                event.preventDefault();
                            }
                        } else {
                            if (!/^[a-zA-Z0-9_.-]$/.test(key)) {
                                event.preventDefault();
                            }
                        }
                        break;
                    case "score":
                        if (!/^[0-9.-]$/.test(key)) {
                            event.preventDefault();
                        }
                        break;
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    accountId() {
        try {
            const id = selectedAccountId(this.controls.accountSelect);
            if (verbose) {
                console.log("ClassesTab.accountId returning", id);
            }
            return id;
        } catch (e) {
            console.error(e);
        }
    }

    async populate(classes = undefined) {
        try {
            if (verbose) {
                console.log("BEGIN populateRows");
            }

            let accountId = this.accountId();
            console.debug("ClassesTab.populate: accountId:", accountId);

            if (!accountId) {
                throw new Error("ClassesTab.populate: invalid accountId", accountId);
            }

            if (classes == undefined) {
                // disablePopulate to prevent infinite loop
                classes = await this.getClasses(true);
            }
            this.classes = classes;

            console.debug("ClassesTab.populate: classes:", classes);
            let levels = classes.render().Classes;
            console.debug("ClassesTab.populate: levels:", levels);

            if (!levels || !Array.isArray(levels)) {
                throw new Error("ClassesTab.populate: invalid levels", levels);
            }

            if (!this.cellTemplate) {
                if (dumpHTML) {
                    console.log(this.controls.tableBody.innerHTML);
                }
                await this.initCellTemplate();
            }
            this.controls.tableBody.innerHTML = "";
            var index = 0;
            for (const level of levels) {
                const row = document.createElement("tr");
                let name = level.name;
                let score = level.score;
                let disabled = false;
                let sliderValue = `${score}`;
                if (index === levels.length - 1) {
                    disabled = true;
                    score = "infinite";
                    sliderValue = "20.0";
                }
                const nameControl = this.appendCell(row, index, "level-name", "input", name, disabled);
                const scoreControl = this.appendCell(row, index, "level-score", "input", score, disabled);
                const sliderControl = this.appendCell(row, index, "level-slider", "input", sliderValue, disabled);
                if (!disabled) {
                    nameControl.addEventListener("keypress", this.handlers.InputKeypress);
                    nameControl.addEventListener("change", this.handlers.NameChanged);
                    sliderControl.addEventListener("input", this.handlers.SliderMoved);
                    scoreControl.addEventListener("change", this.handlers.ScoreChanged);
                    scoreControl.addEventListener("keypress", this.handlers.InputKeypress);
                }
                let deleteDisabled = disabled | (levels.length <= MIN_LEVELS);
                const deleteButton = this.appendCell(row, index, "level-delete", "button", "delete", deleteDisabled);
                if (!deleteDisabled) {
                    deleteButton.addEventListener("click", this.handlers.CellDelete);
                }
                let addDisabled = disabled | (levels.length >= MAX_LEVELS);
                const insertButton = this.appendCell(row, index, "level-insert", "button", "+", addDisabled);
                if (!addDisabled) {
                    insertButton.addEventListener("click", this.handlers.CellInsert);
                }
                this.controls.tableBody.appendChild(row);
                index += 1;
            }

            // check that editedLevels returns the same data we set
            const controlLevels = this.getLevels(true);
            /*
            if (differ(levels, controlLevels)) {
                console.log("classesLevels:", levels);
                console.log("controlLevels:", controlLevels);
                throw new Error("editedLevels() return differs from background getClasses() return");
            }
	    */
            let mismatch = classes.diff(controlLevels);
            if (mismatch) {
                throw new Error("editedLevels() return differs from background getClasses() return");
            }
            console.warn("populate: controls data valid:", controlLevels.valid);

            await this.enableControls(classes.valid);

            if (verbose) {
                console.log("END populateRows");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async updateClasses(classes = undefined, sendToServer = false) {
        try {
            console.debug("updateClasses: classes", classes);
            if (classes === undefined) {
                classes = this.getLevels(true);
            }
            let message = {
                id: sendToServer ? "sendClasses" : "setClasses",
                accountId: classes.accountId,
                classes: classes.render(),
            };
            await this.setStatusPending("sending classes...");
            console.debug("updateClasses: sending:", message);
            let response = await this.sendMessage(message);
            console.debug("updateClasses: received:", response);
            await this.handleResponse(response);
        } catch (e) {
            console.error(e);
        }
    }

    async statusPendingTimeout() {
        await this.updateStatus({ success: false, message: "Pending operation timed out." });
    }

    async setStatusPending(message) {
        try {
            if (this.statusPendingTimer) {
                clearTimeout(this.statusPendingTimer);
            }
            this.statusPendingTimer = setTimeout(this.statusPendingTimeout, STATUS_PENDING_TIMEOUT);
            await this.updateStatus({ success: true, message: message, disable: true });
        } catch (e) {
            console.error(e);
        }
    }

    async updateStatus(state = undefined) {
        try {
            if (verbose) {
                console.debug("updateStatus:", state);
            }

            if (state === undefined) {
                console.warn("ignoring undefined status update");
                return;
            }

            if (this.statusPendingTimer) {
                clearTimeout(this.statusPendingTimer);
                this.statusPendingTimer = null;
            }

            let statusText = "Status";
            this.valid = false;
            if ("classes" in state) {
                this.valid = state.classes.valid;
                if (!this.valid) {
                    console.warn("status not valid");
                }
                this.dirty = state.dirty ? true : false;
                if (this.dirty) {
                    if (this.valid) {
                        statusText = "Status (Unsaved Changes)";
                    } else {
                        statusText = "Status (Save Disabled)";
                    }
                }
            }
            this.controls.statusLabel.innerHTML = statusText;
            this.controls.statusMessage.innerHTML = typeof state.message === "string" ? state.message : "";
        } catch (e) {
            console.error(e);
        }
    }

    async enableControls(enabled) {
        try {
            this.controls.accountSelect.disabled = !enabled;
            await this.disableEditorControl("applyButton", !this.dirty);
            await this.disableEditorControl("okButton", !enabled);
        } catch (e) {
            console.error(e);
        }
    }

    async saveChanges() {
        try {
            await this.setStatusPending("sending changed classes...");
            const response = await this.sendMessage({ id: "sendAllClasses", force: false });
            console.debug("saveChanges: sendAllClasses returned:", response);
            await this.handleResponse(response);
            return response;
        } catch (e) {
            console.error(e);
            await this.updateStatus({ success: false, message: "Pending operation failed." });
        }
    }

    async onDefaultsClick() {
        try {
            const response = await this.sendMessage({ id: "setDefaultClasses", accountId: this.accountId() });
            console.debug("onDefaultsClick: setDefaultClasses returned:", response);
            await this.handleResponse(response);
        } catch (e) {
            console.error(e);
        }
    }

    async onRefreshAllClick() {
        try {
            await this.setStatusPending("Requesting all classes...");
            await this.sendMessage("refreshAllClasses");
            console.debug("onRefreshAllClick: refreshAllClasses returned:", response);
            const response = await this.getClasses();
            console.debug("onRefreshAllClick: getClasses returned:", response);
            await this.handleResponse(response);
        } catch (e) {
            console.error(e);
        }
    }

    async onRefreshClick() {
        try {
            await this.setStatusPending("Requesting classes...");
            const response = await this.sendMessage({ id: "refreshClasses", accountId: this.accountId() });
            console.debug("onRefreshClick: refreshClasses returned:", response);
            await this.handleResponse(response);
        } catch (e) {
            console.error(e);
        }
    }
}
