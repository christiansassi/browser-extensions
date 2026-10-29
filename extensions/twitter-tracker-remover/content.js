/**
 * Publish the setting to the page context and report this tab's loaded state.
 * Toggling reloads the tab, as in the other extensions.
 */

(() => {
	"use strict";

	chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
		const active = !!enabled;
		const publish = () => {
			if (!document.documentElement) return false;
			document.documentElement.dataset.twitterTrackerRemover = active ? "on" : "off";
			chrome.runtime.sendMessage({ type: "report", active }, () => void chrome.runtime.lastError);
			return true;
		};

		if (publish()) return;

		// document_start can run before the root element exists.
		const observer = new MutationObserver(() => {
			if (publish()) observer.disconnect();
		});
		observer.observe(document, { childList: true });
	});
})();
