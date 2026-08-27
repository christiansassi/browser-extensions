/**
 * Popup script for the Notion Theme extension.
 *
 * Render the toggle and the light and dark options for the active tab, then
 * store the new settings and reload that tab when one of them changes.
 */

const toggle = document.getElementById("toggle");
const popupIcon = document.getElementById("popup-icon");
const statusText = document.getElementById("status-text");
const themeOptions = [...document.querySelectorAll(".theme-option")];

/**
 * Report whether a URL points at the Notion web app.
 *
 * @param {string} url - Tab URL to test.
 * @returns {boolean} True for https URLs on app.notion.com and its subdomains.
 */
const isNotion = (url) => {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === "https:" &&
			(hostname === "app.notion.com" || hostname.endsWith(".app.notion.com"));
	} catch {
		return false;
	}
};

/**
 * Mark the option matching a theme as selected.
 *
 * @param {string} theme - Theme to show as selected, "light" or "dark".
 * @returns {void} Nothing. The option elements are updated in place.
 */
const renderTheme = (theme) => {
	for (const option of themeOptions) {
		const selected = option.dataset.theme === theme;
		option.classList.toggle("selected", selected);
		option.setAttribute("aria-pressed", String(selected));
	}
};

/**
 * Store the changed settings, refresh the theme script, and reload the tab.
 *
 * @param {chrome.tabs.Tab} tab - Tab to reload once the settings are stored.
 * @param {{enabled?: boolean, theme?: string}} patch - Settings to write.
 * @returns {Promise<void>} Resolves as the popup closes.
 */
const applyAndReload = async (tab, patch) => {
	await chrome.storage.local.set(patch);
	try {
		await chrome.runtime.sendMessage({ type: "sync-theme-script" });
	} catch {}
	if (tab?.id != null) chrome.tabs.reload(tab.id);
	window.close();
};

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
	const onNotion = isNotion(tab?.url || "");
	const { enabled, theme } = await chrome.storage.local.get({
		enabled: true,
		theme: "light"
	});

	toggle.checked = enabled;
	renderTheme(theme);
	popupIcon.src = onNotion && enabled ? "icons/icon48.png" : "icons/icon48-bw.png";

	if (!onNotion) {
		toggle.disabled = true;
		for (const option of themeOptions) option.disabled = true;
		document.body.classList.add("off-site");
		statusText.textContent = "Available on app.notion.com";
		return;
	}

	document.body.classList.toggle("active", enabled);
	statusText.textContent = enabled
		? "Active on app.notion.com"
		: "Disabled on app.notion.com";

	toggle.addEventListener("change", () => {
		applyAndReload(tab, { enabled: toggle.checked });
	});

	for (const option of themeOptions) {
		option.addEventListener("click", () => {
			const nextTheme = option.dataset.theme;
			if (nextTheme === theme) return;
			renderTheme(nextTheme);
			applyAndReload(tab, { theme: nextTheme });
		});
	}
});
