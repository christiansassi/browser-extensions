/**
 * Service worker for the LinkedIn Promoted Remover extension.
 *
 * Keep the toolbar icon in step with the global toggle, record per tab whether
 * the remover activated on the last load, and reload a LinkedIn tab when its
 * state no longer matches the stored setting.
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

const LINKEDIN = "https://www.linkedin.com/";
/**
 * Report whether a URL points at LinkedIn.
 *
 * @param {string} url - Tab URL to test. A value that is not a string returns false.
 * @returns {boolean} True when the URL starts with the LinkedIn origin.
 */
const isLinkedIn = (url) => typeof url === "string" && url.startsWith(LINKEDIN);

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
 * Tabs that are not on LinkedIn keep this icon until a page reports otherwise.
 *
 * @returns {Promise<void>} Resolves once the browser applied the icon.
 */
const setDefaultGray = () => chrome.action.setIcon({ path: GRAY });
chrome.runtime.onInstalled.addListener(setDefaultGray);
chrome.runtime.onStartup.addListener(setDefaultGray);

// Each LinkedIn page load reports whether the remover actually activated.
// Remember that state per tab so a refresh or later tab switch can detect
// whether the page is in sync with the current global toggle.
chrome.runtime.onMessage.addListener((msg, sender) => {
	if (msg?.type !== "report" || sender.tab?.id == null) return;

	const tabId = sender.tab.id;
	chrome.storage.session.set({ [`active_${tabId}`]: !!msg.active });
	setTabIcon(tabId, !!msg.active);
});

// Same per-tab persistence behavior as the ChatGPT extension: if another
// LinkedIn tab was left running with an old toggle state, reload it only when
// the user switches back to it. Tabs already in sync are left untouched.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	let tab;
	try {
		tab = await chrome.tabs.get(tabId);
	} catch {
		return;
	}

	if (!isLinkedIn(tab.url)) {
		chrome.action.setIcon({ tabId, path: GRAY });
		return;
	}

	const enabled = await getEnabled();
	setTabIcon(tabId, enabled);

	if (tab.status && tab.status !== "complete") return;

	const key = `active_${tabId}`;
	const active = (await chrome.storage.session.get(key))[key];
	if (active === enabled) return;

	chrome.tabs.reload(tabId);
});

// Keep the toolbar icon and the stored per-tab state correct across normal
// navigation, reloads and domain changes.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (!changeInfo.url && changeInfo.status !== "loading") return;

	if (isLinkedIn(tab.url)) {
		setTabIcon(tabId, await getEnabled());
	} else {
		chrome.action.setIcon({ tabId, path: GRAY });
		chrome.storage.session.remove(`active_${tabId}`);
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	chrome.storage.session.remove(`active_${tabId}`);
});

// The toggle is global. Recolor all LinkedIn tabs immediately. Their content
// is synchronized lazily when selected, except for the current tab which the
// popup reloads immediately after a toggle change.
chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local" || !changes.enabled) return;

	const enabled = changes.enabled.newValue;
	chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
		for (const tab of tabs) {
			if (tab.id != null) setTabIcon(tab.id, enabled);
		}
	});
});
