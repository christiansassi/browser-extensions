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
const isLinkedIn = (url) => typeof url === "string" && url.startsWith(LINKEDIN);

const setTabIcon = (tabId, enabled) =>
  chrome.action.setIcon({ tabId, path: enabled ? COLOR : GRAY });

const getEnabled = () =>
  chrome.storage.local.get({ enabled: true }).then((r) => r.enabled);

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
