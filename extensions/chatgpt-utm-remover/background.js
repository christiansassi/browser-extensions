/**
 * Service worker for the ChatGPT UTM Remover extension.
 *
 * Keep the toolbar icon in step with the global toggle, record per tab whether
 * the content script activated on the last load, and reload a ChatGPT tab when
 * its state no longer matches the stored setting.
 */

const COLOR = {
	"16": "icons/icon16.png",
	"32": "icons/icon32.png",
	"48": "icons/icon48.png",
	"128": "icons/icon128.png",
};
const GRAY = {
	"16": "icons/icon16-bw.png",
	"32": "icons/icon32-bw.png",
	"48": "icons/icon48-bw.png",
	"128": "icons/icon128-bw.png",
};

const CHATGPT = "https://chatgpt.com/";
/**
 * Report whether a URL points at the ChatGPT web app.
 *
 * @param {string} url - Tab URL to test. A value that is not a string returns false.
 * @returns {boolean} True when the URL starts with the ChatGPT origin.
 */
const isChatGPT = (url) => typeof url === "string" && url.startsWith(CHATGPT);

/**
 * Set the toolbar icon of one tab to the color or the gray variant.
 *
 * @param {number} tabId - Id of the tab whose icon is updated.
 * @param {boolean} enabled - True for the color icon, false for the gray one.
 * @returns {Promise<void>} Resolves once the browser applied the icon.
 */
const setTabIcon = (tabId, enabled) =>
	chrome.action.setIcon({ tabId, path: enabled ? COLOR : GRAY });

/**
 * Read the global on/off setting from local storage.
 *
 * @returns {Promise<boolean>} Stored value, or true when nothing is stored yet.
 */
const getEnabled = () =>
	chrome.storage.local.get({ enabled: true }).then((r) => r.enabled);

/**
 * Set the gray icon as the default for every tab.
 *
 * Tabs that are not on ChatGPT keep this icon until a page reports otherwise.
 *
 * @returns {Promise<void>} Resolves once the browser applied the icon.
 */
const setDefaultGray = () => chrome.action.setIcon({ path: GRAY });
chrome.runtime.onInstalled.addListener(setDefaultGray);
chrome.runtime.onStartup.addListener(setDefaultGray);

// The content script reports whether it activated on this page load.
// Record that value per tab to detect a tab that is out of sync.
chrome.runtime.onMessage.addListener((msg, sender) => {
	if (msg && msg.type === "report" && sender.tab && sender.tab.id != null) {
		const tabId = sender.tab.id;
		chrome.storage.session.set({ [`active_${tabId}`]: !!msg.active });
		setTabIcon(tabId, !!msg.active);
	}
});

// Switching tabs: only ChatGPT tabs are managed. Reload the tab solely when
// its real state differs from the global setting; otherwise leave it alone.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	let tab;
	try {
		tab = await chrome.tabs.get(tabId);
	} catch {
		return;
	}

	if (!isChatGPT(tab.url)) {
		chrome.action.setIcon({ tabId, path: GRAY });
		return;
	}

	const enabled = await getEnabled();
	setTabIcon(tabId, enabled);

	if (tab.status && tab.status !== "complete") return; // still loading

	const key = `active_${tabId}`;
	const rec = (await chrome.storage.session.get(key))[key];
	if (rec === enabled) return; // already injected/removed as desired
	chrome.tabs.reload(tabId); // out of sync -> apply the change
});

// Keep the icon and per-tab record correct as tabs navigate.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (!changeInfo.url && changeInfo.status !== "loading") return;
	if (isChatGPT(tab.url)) {
		setTabIcon(tabId, await getEnabled());
	} else {
		chrome.action.setIcon({ tabId, path: GRAY });
		chrome.storage.session.remove(`active_${tabId}`);
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	chrome.storage.session.remove(`active_${tabId}`);
});

// Global toggle changed: recolor every open ChatGPT tab to match.
// (Those tabs get reloaded when you switch to them, per the logic above.)
chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local" || !changes.enabled) return;
	const enabled = changes.enabled.newValue;
	chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
		for (const t of tabs) if (t.id != null) setTabIcon(t.id, enabled);
	});
});
