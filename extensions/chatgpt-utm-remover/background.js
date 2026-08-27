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
const isChatGPT = (url) => typeof url === "string" && url.startsWith(CHATGPT);

const setTabIcon = (tabId, enabled) =>
	chrome.action.setIcon({ tabId, path: enabled ? COLOR : GRAY });

const getEnabled = () =>
	chrome.storage.local.get({ enabled: true }).then((r) => r.enabled);

// Non-ChatGPT tabs default to grayscale.
const setDefaultGray = () => chrome.action.setIcon({ path: GRAY });
chrome.runtime.onInstalled.addListener(setDefaultGray);
chrome.runtime.onStartup.addListener(setDefaultGray);

// The content script reports whether it activated on this page load.
// We remember that per tab so we can tell if a tab is already in sync.
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
