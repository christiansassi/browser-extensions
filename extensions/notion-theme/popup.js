const toggle = document.getElementById("toggle");
const popupIcon = document.getElementById("popup-icon");
const statusText = document.getElementById("status-text");
const themeOptions = [...document.querySelectorAll(".theme-option")];

const isNotion = (url) => {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === "https:" &&
			(hostname === "app.notion.com" || hostname.endsWith(".app.notion.com"));
	} catch {
		return false;
	}
};

const renderTheme = (theme) => {
	for (const option of themeOptions) {
		const selected = option.dataset.theme === theme;
		option.classList.toggle("selected", selected);
		option.setAttribute("aria-pressed", String(selected));
	}
};

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
