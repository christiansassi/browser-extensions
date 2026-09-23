/**
 * Service worker for the GitHub Public Highlight extension.
 *
 * Keep the toolbar icon in step with the global toggle, record per tab whether
 * the highlighter activated on the last load, and reload a GitHub tab when its
 * state no longer matches the stored setting.
 */

const COLOR = {
	"16": "icons/icon16.png",
	"32": "icons/icon32.png",
	"48": "icons/icon48.png",
	"128": "icons/icon128.png"
};

const GRAY = {
	"16": "icons/icon16-dim.png",
	"32": "icons/icon32-dim.png",
	"48": "icons/icon48-dim.png",
	"128": "icons/icon128-dim.png"
};

const GITHUB = "https://github.com/";
/**
 * Report whether a URL points at GitHub.
 *
 * @param {string} url - Tab URL to test. A value that is not a string returns false.
 * @returns {boolean} True when the URL starts with the GitHub origin.
 */
const isGitHub = (url) => typeof url === "string" && url.startsWith(GITHUB);

/**
 * Set the toolbar icon of one tab to the color or the gray variant.
 *
 * @param {number} tabId - Id of the tab whose icon is updated.
 * @param {boolean} enabled - True for the color icon, false for the gray one.
 * @returns {Promise<void>} Resolves once the browser applied the icon.
 */
async function setTabIcon(tabId, enabled) {
	try {
		await chrome.action.setIcon({ tabId, path: enabled ? COLOR : GRAY });
	} catch {
		// The tab may close while its state is being read.
	}
}

/**
 * Read the global on/off setting from local storage.
 *
 * @returns {Promise<boolean>} Stored value, or true when nothing is stored yet.
 */
async function getEnabled() {
	const { enabled } = await chrome.storage.local.get({ enabled: true });
	return !!enabled;
}

/**
 * Set the gray icon as the default for every tab.
 *
 * Tabs that are not on GitHub keep this icon until a page reports otherwise.
 *
 * @returns {Promise<void>} Resolves once the browser applied the icon.
 */
const setDefaultGray = () => chrome.action.setIcon({ path: GRAY });
chrome.runtime.onInstalled.addListener(setDefaultGray);
chrome.runtime.onStartup.addListener(setDefaultGray);

// Each GitHub page load reports whether the highlighter actually activated.
// Remember that state per tab so a refresh or later tab switch can detect
// whether the page is in sync with the current global toggle.
/**
 * Save the setting and version loaded by a GitHub content script.
 * @param {object} msg - Content script report.
 * @param {chrome.runtime.MessageSender} sender - Browser-provided message source.
 * @returns {Promise<void>} Resolve after saving state and updating the icon.
 */
async function onReport(msg, sender) {
	if (msg?.type !== "report" || sender.tab?.id == null || !isGitHub(sender.url)) return;

	const tabId = sender.tab.id;
	await chrome.storage.session.set({ [`active_${tabId}`]: { active: !!msg.active, version: msg.version } });
	await setTabIcon(tabId, await getEnabled());
}

// Same per-tab persistence behavior as the ChatGPT extension: if another
// GitHub tab was left running with an old toggle state, reload it only when
// the user switches back to it. Tabs already in sync are left untouched.
/**
 * Reload a selected GitHub tab if its setting or extension version is outdated.
 * @param {{tabId: number}} info - Activated tab information.
 * @returns {Promise<void>} Resolve after checking the loaded tab state.
 */
async function onActivated({ tabId }) {
	let tab;
	try {
		tab = await chrome.tabs.get(tabId);
	} catch {
		return;
	}

	if (!isGitHub(tab.url)) {
		await setTabIcon(tabId, false);
		return;
	}

	const enabled = await getEnabled();
	await setTabIcon(tabId, enabled);

	if (tab.status && tab.status !== "complete") return;

	const key = `active_${tabId}`;
	const active = (await chrome.storage.session.get(key))[key];
	if (active?.active === enabled && active.version === chrome.runtime.getManifest().version) return;

	try {
		await chrome.tabs.reload(tabId);
	} catch {
		// The tab may close before the reload starts.
	}
}

// Keep the toolbar icon and the stored per-tab state correct across normal
// navigation, reloads and domain changes.
/**
 * Update icons and discard saved state when a tab leaves GitHub.
 * @param {number} tabId - Updated tab ID.
 * @param {object} changeInfo - Changed tab properties.
 * @param {chrome.tabs.Tab} tab - Current tab information.
 * @returns {Promise<void>} Resolve after synchronizing the navigation state.
 */
async function onUpdated(tabId, changeInfo, tab) {
	if (!changeInfo.url && changeInfo.status !== "loading") return;

	if (isGitHub(tab.url)) {
		await setTabIcon(tabId, await getEnabled());
	} else {
		await setTabIcon(tabId, false);
		await onRemoved(tabId);
	}
}

/**
 * Discard state for a closed or navigated tab.
 * @param {number} tabId - Tab ID whose state is no longer needed.
 * @returns {Promise<void>} Resolve when session storage is updated.
 */
async function onRemoved(tabId) {
	await chrome.storage.session.remove(`active_${tabId}`);
}

// The toggle is global. Recolor all GitHub tabs immediately. Their content
// is synchronized lazily when selected, except for the current tab which the
// popup reloads immediately after a toggle change.
/**
 * Recolor GitHub icons after the global setting changes.
 * @param {object} changes - Changed storage entries.
 * @param {string} area - Storage area containing the changes.
 * @returns {Promise<void>} Resolve after updating the icons.
 */
async function onSettingsChanged(changes, area) {
	if (area !== "local" || !changes.enabled) return;

	const enabled = changes.enabled.newValue;
	const tabs = await chrome.tabs.query({ url: "https://github.com/*" });
	for (const tab of tabs) {
		if (tab.id != null) await setTabIcon(tab.id, enabled);
	}
}

chrome.runtime.onMessage.addListener(onReport);
chrome.tabs.onActivated.addListener(onActivated);
chrome.tabs.onUpdated.addListener(onUpdated);
chrome.tabs.onRemoved.addListener(onRemoved);
chrome.storage.onChanged.addListener(onSettingsChanged);
