/**
 * Content script for the Notion Theme extension.
 *
 * Report the settings this page loaded with, which the service worker uses to
 * detect a tab that still runs an older setting.
 */

chrome.storage.local.get({ enabled: true, theme: "light" }, ({ enabled, theme }) => {
	chrome.runtime.sendMessage({
		type: "report",
		enabled: !!enabled,
		theme: theme === "dark" ? "dark" : "light"
	});
});
