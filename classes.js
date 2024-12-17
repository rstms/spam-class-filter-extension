import { sendEmailRequest } from "./email.js";
import { differ } from "./common.js";

const MIN_SCORE = -100.0;
const MAX_SCORE = 100.0;
const verbose = false;

/* global console */

export class Classes {
    constructor(state, options, accounts) {
        if (typeof state !== "object") {
            state = {};
        }

        if (!("options" in state)) {
            state.options = {};
        }

        if (!("classes" in state)) {
            state.classes = {
                dirty: {},
                server: {},
            };
        }

        this.options = state.options;
        this.classes = state.classes;
        this.defaultLevels = [
            {
                name: "ham",
                score: "0",
            },
            {
                name: "possible",
                score: "3",
            },
            {
                name: "probable",
                score: "10",
            },
            {
                name: "spam",
                score: "999",
            },
        ];
        for (const [key, value] of Object.entries(options)) {
            this.options[key] = value;
        }
        this.accounts = accounts;
    }

    state() {
        return {
            options: this.options,
            classes: this.classes,
        };
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

    levels(account) {
        try {
            var classes = this.all();
            return classes[account.id];
        } catch (e) {
            console.error(e);
        }
    }

    isDirty(account) {
        try {
            if (!(account.id in this.classes.server)) {
                throw new Error("class not present");
            }
            if (!(account.id in this.classes.dirty)) {
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

    async get(account, force = false) {
        try {
            var levels = this.levels(account);
            if (force || !Array.isArray(levels) || levels.length === 0) {
                const result = await sendEmailRequest(account, "list", this.options);
                const returned = result.json.Classes;
                const validated = this.validateLevels(returned);
                if (validated.error) {
                    console.warn("server list return failed validation:", validated.error, returned);
                }
                delete this.classes.dirty[account.id];
                this.classes.server[account.id] = validated.levels;
                levels = validated.levels;
            }
            return levels;
        } catch (e) {
            console.error(e);
        }
    }

    setLevels(account, levels) {
        try {
            if (!differ(levels, this.classes.server[account.id])) {
                delete this.classes.dirty[account.id];
            } else {
                this.classes.dirty[account.id] = levels;
            }
        } catch (e) {
            console.error(e);
        }
    }

    async set(account, levels) {
        try {
            const validated = this.validateLevels(levels);
            if (validated.error) {
                console.warn("set levels failed validation:", validated.error, levels);
            }
            this.setLevels(account, validated.levels);
            return this.validate(account);
        } catch (e) {
            console.error(e);
        }
    }

    async setDefaultLevels(account) {
        try {
            await this.set(account, this.defaultLevels);
            return this.defaultLevels;
        } catch (e) {
            console.error(e);
        }
    }

    async sendAll(accounts, force = false) {
        try {
            var classes = this.all();
            let ret = {
                success: true,
                error: false,
                message: "Classes updated successfully.",
            };

            for (const id of Object.keys(classes)) {
                const result = await this.send(accounts[id], force);
                if (result.error) {
                    ret = {
                        success: false,
                        error: true,
                        message: "Failed to update all changed classes.",
                    };
                }
            }
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    validate(account, levels = undefined) {
        try {
            if (levels === undefined) {
                levels = this.levels(account);
            }
            let ret = {
                dirty: this.isDirty(account),
                levels: levels,
                message: "",
            };

            const validated = this.validateLevels(ret.levels);
            if (validated.error) {
                ret.message = validated.error;
                ret.valid = false;
            } else {
                ret.levels = validated.levels;
                this.setLevels(account, validated.levels);
                ret.valid = true;
            }
            return ret;
        } catch (e) {
            console.error(e);
        }
    }

    validateLevels(levels) {
        try {
            if (!Array.isArray(levels)) {
                return { levels: levels, error: "unexpected data type" };
            }
            if (levels.length < 2) {
                return { levels: levels, error: "not enough levels" };
            }
            var validLevels = [];
            var lastScore = undefined;
            var classObj = {};
            var scoreObj = {};
            for (const inputLevel of levels) {
                const level = { name: inputLevel.name, score: inputLevel.score };
                if (typeof level.name === "string") {
                    level.name = level.name.trim();
                    level.name = level.name.replace(/\s/g, "_");
                } else {
                    return { levels: levels, error: "unexpected class name type" };
                }

                if (level.name.length === 0) {
                    return { levels: levels, error: "missing class name" };
                }

                switch (typeof level.score) {
                    case "number":
                        level.score = String(parseFloat(level.score));
                        break;
                    case "string":
                        break;
                    default:
                        return { levels: levels, error: "unexpected threshold type" };
                }

                level.score = level.score.trim();
                if (level.score.length === 0) {
                    return { levels: levels, error: "missing threshold value" };
                }

                if (!isFinite(level.score)) {
                    return { levels: levels, error: "threshold value not a number" };
                }

                if (!/^[a-zA-Z]/.test(level.name)) {
                    return { levels: levels, error: "class names must start with a letter" };
                }

                if (!/^[a-zA-Z0-9_-]+$/.test(level.name)) {
                    return `illegal characters in class name: '${level.name}'`;
                }

                if (!/^(-|)(([0-9]+(\.|)[0-9]*)|([0-9]*(\.|)[0-9]+))$/.test(level.score)) {
                    return `illegal characters in threshold: '${level.score}'`;
                }

                if (
                    level.name !== "spam" &&
                    (parseFloat(level.score) < parseFloat(MIN_SCORE) || parseFloat(level.score) > parseFloat(MAX_SCORE))
                ) {
                    return `threshold out of range: '${level.score}'`;
                }

                if (lastScore !== undefined && parseFloat(level.score) < lastScore) {
                    return { levels: levels, error: "thresholds not in ascending order" };
                }

                classObj[level.name] = level.score;
                scoreObj[level.score] = level.name;
                validLevels.push({ name: level.name, score: level.score });
                lastScore = parseFloat(level.name);
            }
            if (!("spam" in classObj)) {
                return { levels: levels, error: "missing spam class" };
            }
            if (classObj["spam"] !== "999") {
                return { levels: levels, error: "unexpected spam class threshold" };
            }
            if (levels.length !== Object.keys(classObj).length) {
                return { levels: levels, error: "duplicate class name" };
            }
            if (levels.length !== Object.keys(scoreObj).length) {
                return { levels: levels, error: "duplicate threshold value" };
            }

            if (levels.length !== validLevels.length) {
                return { levels: levels, error: "validation mismatch" };
            }

            return { levels: validLevels, error: "" };
        } catch (e) {
            console.error(e);
        }
    }

    async send(account, force) {
        try {
            const levels = this.levels(account);
            if (levels !== undefined) {
                const validated = this.validate(account);
                if (!validated.valid) {
                    throw new Error(`Validation failed: ${validated.message}`);
                }
                if (force || this.isDirty(account)) {
                    var values = [];
                    for (const level of validated.levels) {
                        values.push(`${level.name}=${level.score}`);
                    }
                    const subject = "reset " + values.join(" ");
                    const result = await sendEmailRequest(account, subject, this.options);
                    const returned = result.json.Classes;
                    const validatedReturn = this.validateLevels(returned);
                    if (validatedReturn.error) {
                        console.debug("account:", account);
                        console.debug("returned:", returned);
                        console.error("failure: reset result failed validation:", validatedReturn.error);
                        throw new Error(`reset result validation failed: ${validatedReturn.error}`);
                    }
                    if (differ(validated.levels, validatedReturn.levels)) {
                        console.debug("account:", account);
                        console.debug("validated.levels:", returned);
                        console.debug("validatedReturn.levels:", validatedReturn.levels);
                        throw new Error("reset result mismatch");
                    }
                    delete this.classes.dirty[account.id];
                    this.classes.server[account.id] = validated.levels;
                    return { success: true, error: false, message: "classes sent successfully" };
                }
            }
            return { success: true, error: false, message: "classes unchanged" };
        } catch (e) {
            console.error(e);
            return { success: false, error: true, message: `${e}` };
        }
    }

    async sendCommand(account, subject) {
        try {
            if (verbose) {
                console.log("sendCommand:", account, subject);
            }
            return await sendEmailRequest(account, subject);
        } catch (e) {
            console.error(e);
        }
    }
}
