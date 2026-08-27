/**
 * Service worker for the Notion Theme extension.
 *
 * Register the main world script that forces the chosen color scheme, keep the
 * toolbar icon in step with the settings, and reload a Notion tab whose page
 * still runs an older setting.
 */

const COLOR = {
	"16": "icons/icon16.png",
	"32": "icons/icon32.png",
	"48": "icons/icon48.png",
	"128": "icons/icon128.png"
};

const GRAY = {
	"16": "icons/icon16-bw.png",
	"32": "icons/icon32-bw.png",
	"48": "icons/icon48-bw.png",
	"128": "icons/icon128-bw.png"
};

const MATCHES = [
	"https://app.notion.com/*",
	"https://*.app.notion.com/*"
];

const SCRIPT_ID = "notion-theme-main-world";

/**
 * Report whether a URL points at the Notion web app.
 *
 * @param {string} url - Tab URL to test.
 * @returns {boolean} True for https URLs on app.notion.com and its subdomains.
 */
const isNotion = (url) => {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === "https:" &&
			(hostname === "app.notion.com" || hostname.endsWith(".app.notion.com"));
	} catch {
		return false;
	}
};

/**
 * Read the extension settings from local storage.
 *
 * @returns {Promise<{enabled: boolean, theme: string}>} Stored settings, with
 *   the defaults filled in for values that are not set yet.
 */
const getSettings = () => chrome.storage.local.get({
	enabled: true,
	theme: "light"
});

/**
 * Set the toolbar icon of one tab from its URL and the enabled setting.
 *
 * @param {number} tabId - Id of the tab whose icon is updated.
 * @param {string} url - Current URL of that tab.
 * @returns {Promise<void>} Resolves once the browser applied the icon.
 */
const setTabIcon = async (tabId, url) => {
	const { enabled } = await getSettings();
	return chrome.action.setIcon({
		tabId,
		path: isNotion(url) && enabled ? COLOR : GRAY
	});
};

/**
 * Register the main world script that matches the current settings.
 *
 * Unregister the previous script first, then register the light or the dark
 * variant, leaving none registered while the extension is disabled.
 *
 * @returns {Promise<void>} Resolves once the registration is up to date.
 */
const syncThemeScript = async () => {
	const { enabled, theme } = await getSettings();

	try {
		await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
	} catch {}

	if (!enabled) return;

	await chrome.scripting.registerContentScripts([{
		id: SCRIPT_ID,
		matches: MATCHES,
		js: [theme === "dark" ? "theme-dark.js" : "theme-light.js"],
		runAt: "document_start",
		world: "MAIN",
		persistAcrossSessions: true
	}]);
};

/**
 * Refresh the toolbar icon of every open tab.
 *
 * @returns {Promise<void>} Resolves once every tab has been visited.
 */
const updateOpenTabIcons = async () => {
	const tabs = await chrome.tabs.query({});
	for (const tab of tabs) {
		if (tab.id != null) setTabIcon(tab.id, tab.url || "");
	}
};

/**
 * Fill in missing settings, register the theme script, and set the icons.
 *
 * @returns {Promise<void>} Resolves once the extension is ready.
 */
const initialize = async () => {
	const current = await chrome.storage.local.get(["enabled", "theme"]);
	const patch = {};

	if (typeof current.enabled !== "boolean") patch.enabled = true;
	if (current.theme !== "light" && current.theme !== "dark") patch.theme = "light";
	if (Object.keys(patch).length) await chrome.storage.local.set(patch);

	await syncThemeScript();
	await chrome.action.setIcon({ path: GRAY });
	await updateOpenTabIcons();
};

chrome.runtime.onInstalled.addListener(() => { initialize(); });
chrome.runtime.onStartup.addListener(() => { initialize(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg?.type === "sync-theme-script") {
		syncThemeScript()
			.then(() => sendResponse({ ok: true }))
			.catch((error) => sendResponse({ ok: false, error: String(error) }));
		return true;
	}

	if (msg?.type === "report" && sender.tab?.id != null) {
		const tabId = sender.tab.id;
		chrome.storage.session.set({
			[`state_${tabId}`]: {
				enabled: !!msg.enabled,
				theme: msg.theme === "dark" ? "dark" : "light"
			}
		});
		setTabIcon(tabId, sender.tab.url || "");
	}
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	let tab;
	try {
		tab = await chrome.tabs.get(tabId);
	} catch {
		return;
	}

	setTabIcon(tabId, tab.url || "");
	if (!isNotion(tab.url) || (tab.status && tab.status !== "complete")) return;

	const settings = await getSettings();
	const key = `state_${tabId}`;
	const state = (await chrome.storage.session.get(key))[key];
	const expectedTheme = settings.theme === "dark" ? "dark" : "light";

	if (state &&
			state.enabled === !!settings.enabled &&
			state.theme === expectedTheme) return;

	chrome.tabs.reload(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (!changeInfo.url && changeInfo.status !== "loading") return;
	const url = changeInfo.url || tab.url || "";
	setTabIcon(tabId, url);
	if (!isNotion(url)) chrome.storage.session.remove(`state_${tabId}`);
});

chrome.tabs.onRemoved.addListener((tabId) => {
	chrome.storage.session.remove(`state_${tabId}`);
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local" || (!changes.enabled && !changes.theme)) return;
	syncThemeScript().catch(() => {});
	if (changes.enabled) updateOpenTabIcons().catch(() => {});
});

initialize().catch(() => {});
