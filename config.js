
async function initConfig() {
    var cfg = {
	use_email_interface: true,
	domain: {
	    "rstms.net": true,
	    "rstms.com": true,
	    "bootnotice.com": true,
	    "cypress-trading.com": true,
	    "greenbluffllc.com": true,
	    "harborstreetventures.com": true,
	    "citybestmanagement.com": true,
	}
    }
    return cfg 
}

export async function getConfig() {
    try {
	var local = await browser.storage.local.get(["config"]);
    } catch(error) { console.log("load config failed:", error); }
    if (local.config) {
	return local.config;
    }
    const newConfig = await initConfig();
    return newConfig;
}

export async function saveConfig(saveConfig=null) {
    var config;
    if (saveConfig) {
	config = saveConfig;
    } else {
	config = await getConfig();
    }
    try {
	await browser.storage.local.set({config: config});
    } catch(error) { console.log("save config failed:", error); }
}

export async function saveWindowPos(name, pos) {
    var config = await getConfig();
    if (!config.windowPos) {
	config.windowPos = {};
    }
    config.windowPos[name] = pos;
    await saveConfig(config);
}

export async function getWindowPos(name, defaults) {
    var config = await getConfig();
    if ( config.windowPos && config.windowPos[name] ) {
	return config.windowPos[name];
    }
    return defaults;
}
