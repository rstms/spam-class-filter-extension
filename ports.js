import { generateUUID } from "./common.js";

/* global console, setTimeout, clearTimeout */

const PORT_CONNECT_TIMEOUT = 3000;

export const WAIT = 0;
export const NO_WAIT = 1;
export const WAIT_FOREVER = 2;

export var connectedPorts = {};

var portWaiters = {};

export function get(name, waitMode = WAIT, timeout = PORT_CONNECT_TIMEOUT) {
    return new Promise((resolve, reject) => {
        try {
            if (waitMode === NO_WAIT) {
                resolve(connectedPorts[name]);
            } else {
                const id = generateUUID();
                var timer = null;
                if (waitMode === WAIT && timeout !== 0) {
                    timer = setTimeout(() => {
                        delete portWaiters[id];
                        reject(new Error("port connection timeout", name));
                    }, timeout);
                }
                portWaiters[id] = {
                    id: id,
                    name: name,
                    resolve: resolve,
                    reject: reject,
                    timer: timer,
                };
            }
        } catch (e) {
            reject(e);
        }
    });
}

const ADD_PORT = 1;
const REMOVE_PORT = 2;

function manage(port, op) {
    try {
        const waiters = Object.values(portWaiters);
        for (const waiter of waiters) {
            if (waiter.name === port.name) {
                clearTimeout(waiter.timer);
                delete portWaiters[waiter.id];
                switch (op) {
                    case ADD_PORT:
                        waiter.resolve(port);
                        break;
                    case REMOVE_PORT:
                        waiter.reject(new Error("port removed:", port.name));
                        break;
                    default:
                        throw new Error(`unexpected op: ${op}`);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

export function add(port) {
    try {
        connectedPorts[port.name] = port;
        return manage(port, ADD_PORT);
    } catch (e) {
        console.error(e);
    }
}

export function remove(port) {
    try {
        delete connectedPorts[port.name];
        return manage(port, REMOVE_PORT);
    } catch (e) {
        console.error(e);
    }
}
