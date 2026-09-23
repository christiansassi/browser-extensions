/**
 * Render the popup toggle and site status, then save changes and reload the tab.
 */

const toggle = document.getElementById("toggle");
const popupIcon = document.getElementById("popup-icon");
const statusText = document.getElementById("status-text");
let activeTabId;

/**
 * Save the toggle, reload the active GitHub tab, and close the popup.
 * @returns {Promise<void>} Resolve after applying the saved setting.
 */
async function applyAndReload() {
	toggle.disabled = true;
	try {
		await chrome.storage.local.set({ enabled: toggle.checked });
		await chrome.tabs.reload(activeTabId);
		window.close();
	} catch {
		statusText.textContent = "Could not reload. Try again.";
		toggle.disabled = false;
	}
}

/**
 * Render the saved toggle and disable controls outside GitHub.
 * @returns {Promise<void>} Resolve when the popup is ready.
 */
async function initialize() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	const { enabled } = await chrome.storage.local.get({ enabled: true });
	const onGitHub = tab?.url?.startsWith("https://github.com/") === true;
	toggle.checked = !!enabled;
	popupIcon.src = onGitHub && enabled ? "icons/icon48.png" : "icons/icon48-dim.png";
	document.body.classList.toggle("off-site", !onGitHub);
	document.body.classList.toggle("active", onGitHub && !!enabled);
	statusText.textContent = onGitHub
		? (enabled ? "Active on github.com" : "Disabled on github.com")
		: "Available on github.com";
	if (!onGitHub || tab.id == null) return;
	activeTabId = tab.id;
	toggle.disabled = false;
	toggle.addEventListener("change", applyAndReload);
}

void initialize();
