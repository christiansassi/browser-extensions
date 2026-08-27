chrome.storage.local.get({ enabled: true, theme: "light" }, ({ enabled, theme }) => {
  chrome.runtime.sendMessage({
    type: "report",
    enabled: !!enabled,
    theme: theme === "dark" ? "dark" : "light"
  });
});
