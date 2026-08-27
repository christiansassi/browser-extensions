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

const isNotion = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" &&
      (hostname === "app.notion.com" || hostname.endsWith(".app.notion.com"));
  } catch {
    return false;
  }
};

const getSettings = () => chrome.storage.local.get({
  enabled: true,
  theme: "light"
});

const setTabIcon = async (tabId, url) => {
  const { enabled } = await getSettings();
  return chrome.action.setIcon({
    tabId,
    path: isNotion(url) && enabled ? COLOR : GRAY
  });
};

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

const updateOpenTabIcons = async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) setTabIcon(tab.id, tab.url || "");
  }
};

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
