import { differ, selectedAccountId } from "./common.js";

/* globals document, console, setTimeout, clearTimeout */

const verbose = true;
const dumpHTML = false;

const MIN_LEVELS = 2;
const MAX_LEVELS = 16;
const STATUS_PENDING_TIMEOUT = 5120;

export class ClassesTab {
    constructor(sendMessage, handlers) {
        this.controls = {};
        this.sendMessage = sendMessage;
        this.cellTemplate = null;
        this.accountNames = undefined;
        this.handlers = handlers;
    }

    async getClasses(accountId) {
        try {
            await this.setStatusPending("requesting classes...");
            return await this.sendMessage({ id: "getClassLevels", accountId: accountId });
        } catch (e) {
            console.error(e);
        }
    }

    getLevels() {
        try {
            let ret = [];
            let i = 0;
            while (true) {
                let nameElement = document.getElementById(`level-name-${i}`);
                if (!nameElement) {
                    return ret;
                }
                let scoreElement = document.getElementById(`level-score-${i}`);
                let level = {
                    name: nameElement.value,
                };
                if (level.name === "spam") {
                    level.score = "999";
                } else {
                    level.score = String(parseFloat(scoreElement.value));
                }
                ret.push(level);
                i += 1;
            }
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
            var levels = this.getLevels();
            levels.splice(row, 1);
            await this.sendMessage({ id: "setClassLevels", accountId: this.accountId(), levels: levels });
            await this.populate(levels);
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
            let levels = this.getLevels();
            let newScore = parseFloat(levels[row].score);
            let nextScore = parseFloat(levels[row + 1].score);
            if (nextScore === 999) {
                newScore += 1;
            } else {
                newScore += (nextScore - newScore) / 2;
            }
            levels.splice(row + 1, 0, { name: this.newLevelName(levels), score: String(newScore) });
            await this.sendMessage({ id: "setClassLevels", accountId: this.accountId(), levels: levels });
            await this.populate(levels);
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
            return selectedAccountId(this.controls.accountSelect);
        } catch (e) {
            console.error(e);
        }
    }

    async populate(levels = undefined) {
        try {
            if (verbose) {
                console.log("BEGIN populateRows");
            }
            if (levels == undefined) {
                levels = await this.getClasses(this.accountId());
            }
            if (!this.cellTemplate) {
                if (dumpHTML) {
                    console.log(this.controls.tableBody.innerHTML);
                }
                this.initCellTemplate();
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
            const controlLevels = this.getLevels();
            if (differ(levels, controlLevels)) {
                console.log("getClasses:", levels);
                console.log("controlLevels:", controlLevels);
                throw new Error("editedLevels() return differs from background getClasses() return");
            }

            await this.updateClasses();
            if (verbose) {
                console.log("END populateRows");
            }
        } catch (e) {
            console.error(e);
        }
    }

    async updateClasses(sendToServer = false) {
        try {
            const id = this.accountId();

            await this.setStatusPending("sending classes...");
            let state = await this.sendMessage({
                id: sendToServer ? "sendClassLevels" : "setClassLevels",
                accountId: id,
                levels: this.getLevels(),
                name: this.accountNames[id],
            });
            return await this.updateClassesStatus(state);
        } catch (e) {
            console.error(e);
        }
    }

    async statusPendingTimeout() {
        await this.updateClassesStatus({ error: true, message: "Pending operation timed out." });
    }

    async setStatusPending(message) {
        try {
            if (this.statusPendingTimer) {
                clearTimeout(this.statusPendingTimer);
            }
            this.statusPendingTimer = setTimeout(this.statusPendingTimeout, STATUS_PENDING_TIMEOUT);
            await this.updateClassesStatus({ message: message, disable: true });
        } catch (e) {
            console.error(e);
        }
    }

    async updateClassesStatus(state = undefined) {
        try {
            if (this.statusPendingTimer) {
                clearTimeout(this.statusPendingTimer);
                this.statusPendingTimer = null;
            }

            if (state == undefined) {
                state = {
                    error: true,
                    message: "unknown error",
                };
            }

            if (verbose) {
                console.log("updateClassesStatus:", state);
            }

            let parts = [];

            if (state.error) {
                parts.push("Error");
            } else {
                if (state.dirty) {
                    if (state.valid) {
                        parts.push("Unsaved Validated Changes");
                    } else {
                        parts.push("Validatation Failed");
                        state.disable = true;
                    }
                } else if (state.dirty === false) {
                    parts.push("Unchanged");
                }
            }

            if (state.message) {
                let prefix = "";
                if (parts.length > 0) {
                    prefix = ": ";
                }
                parts.push(prefix + state.message.trim());
            }
            this.controls.statusMessage.innerHTML = parts.join(" ");

            this.controls.accountSelect.disabled = state.disable;
            this.controls.applyButton.disabled = state.disable;
            this.controls.okButton.disabled = state.disable;
        } catch (e) {
            console.error(e);
        }
    }

    enableControls(enabled) {
        try {
            this.controls.accountSelect.disabled = !enabled;
            this.controls.tableBody.disabled = !enabled;
            this.controls.applyButton.disabled = !enabled;
            this.controls.okButton.disabled = !enabled;
        } catch (e) {
            console.error(e);
        }
    }

    async saveChanges() {
        try {
            await this.setStatusPending("sending changed classes...");
            const state = await this.sendMessage({ id: "sendAllClassLevels", force: false });
            await this.updateClassesStatus(state);
            return state;
        } catch (e) {
            console.error(e);
            await this.updateClassesStatus({ error: true, message: "Pending operation failed." });
        }
    }

    async onApplyClick() {
        try {
            await this.saveChanges();
        } catch (e) {
            console.error(e);
        }
    }

    async onDefaultsClick() {
        try {
            const levels = await this.sendMessage({ id: "setDefaultLevels", accountId: this.accountId() });
            await this.populate(levels);
        } catch (e) {
            console.error(e);
        }
    }

    async onRefreshClick() {
        try {
            await this.setStatusPending("requesting all classes...");
            await this.sendMessage("refreshAllClassLevels");
            const levels = await this.getClasses(this.accountId());
            await this.populate(levels);
        } catch (e) {
            console.error(e);
        }
    }
}
