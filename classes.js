import { sendEmailRequest } from "./email.js";
import { domainPart, differ } from "./common.js";

export class Classes {
    constructor() {
        this.classes = {
            dirty: {},
            server: {},
        };
        this.defaultLevels = [
            {
                name: "ham",
                score: 0,
            },
            {
                name: "possible",
                score: 3,
            },
            {
                name: "probable",
                score: 10,
            },
            {
                name: "spam",
                score: 999,
            },
        ];
    }

    all() {
        try {
            var classes = {};
            for (const [id, levels] of Object.entries(this.classes.server)) {
                classes[id] = levels;
            }
            for (const [id, levels] of Object.entries(this.classes.dirty)) {
                classes[id] = levels;
            }
            return classes;
        } catch (e) {
            console.error(e);
        }
    }

    isDirty(account) {
        try {
            if (!this.classes.server.hasOwnProperty(account.id)) {
                throw new Error("class not present");
            }
            if (!this.classes.dirty.hasOwnProperty(account.id)) {
                return false;
            }
            const dirty = differ(this.classes.dirty[account.id], this.classes.server[account.id]);
            if (!dirty) {
                delete this.classes.dirty[account.id];
            }
            return dirty;
        } catch (e) {
            console.error(e);
        }
    }

    setServer(account, levels) {
        try {
            delete this.classes.dirty[account.id];
            this.classes.server[account.id] = levels;
        } catch (e) {
            console.error(e);
        }
    }

    async get(account, force = false) {
        try {
            var classes = this.all();
            var levels = classes[account.id];
            if (force || !Array.isArray(levels) || levels.lengh === 0) {
                const result = await sendEmailRequest(account, "list");
                levels = result.json.Classes;
                this.setServer(account.id, levels);
            }
            return levels;
        } catch (e) {
            console.error(e);
        }
    }

    set(account, levels) {
        try {
            if (!differ(levels, this.classes.server[account.id])) {
                delete this.classes.dirty[account.id];
            } else {
                this.classes.dirty[account.id] = levels;
            }
            return validate(account);
        } catch (e) {
            console.error(e);
        }
    }

    async setDefaultLevels(account) {
        await this.set(account, this.defaultLevels);
    }

    async sendAllUpdates(accounts, force = false) {
        try {
            var classes = this.all();
            for (const [id, levels] of Object.entries(classes)) {
                await this.send(accounts[id], levels, force);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async sendUpdate(account, force = false) {
        try {
            const classes = this.all();
            var levels = classes[account.id];
            await this.send(account, levels, force);
        } catch (e) {
            console.error(e);
        }
    }

    throwInvalidLevels(levels) {
        const error = this.validateLevels(levels);
        if (error) {
            console.error("level validation failed:", error, levels);
            throw new Error(`Level validation failed: ${error}`);
        }
        return error;
    }

    validate(account) {
        try {
            const levels = this.get(account);
            const message = this.validateLevels(levels);
            return {
                dirty: this.isDirty(account),
                valid: message ? false : true,
                message: message,
            };
        } catch (e) {
            console.error(e);
        }
    }

    validateLevels(levels) {
        try {
            if (!Array.isArray(levels)) {
                return "unexpected data type";
            }
            if (levels.length < 2) {
                return "not enough levels";
            }
            var lastScore = 0;
            var levelObj = {};
            for (let i = 0; i < levels.length; i++) {
                if (i > 0 && levels[i].score === lastScore) {
                    return "duplicate threshold value";
                }
                if (i > 0 && levels[i].score < lastScore) {
                    return "thresholds not in ascending order";
                }
                lastScore = levels[i].score;
                levelObj[levels[i].name] = levels[i].score;
            }
            if (!levelObj.hasOwnProperty("spam")) {
                return "missing spam class";
            }
            if (levelObj["spam"] != 999) {
                return "unexpected spam class threshold";
            }
            if (levels.length != Object.keys(levelObj).length) {
                return "duplicate class name";
            }
            return "";
        } catch (e) {
            console.error(e);
        }
    }

    async send(account, levels, force) {
        try {
            this.throwInvalidLevels(levels);
            if (force || this.isDirty(account)) {
                var values = [];
                for (const level of levels) {
                    values.push(level.name + "=" + level.score);
                }
                const subject = "reset " + levels.join(",");
                const result = await sendEmailRequest(account, subject);
                const returned = result.json.Classes;
                this.throwInvalidLevels(returned);
                if (differ(levels, returned)) {
                    throw new Error("reset result mismatch:", account.id, levels, returned);
                }
                delete this.classes.dirty[account.id];
                this.classes.server[account.id] = levels;
            }
        } catch (e) {
            console.error(e);
        }
    }
}
