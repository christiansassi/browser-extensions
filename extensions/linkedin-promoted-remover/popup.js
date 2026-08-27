/**
 * Popup script for the LinkedIn Promoted Remover extension.
 *
 * Render the toggle and the status line for the active tab, then store the new
 * value and reload that tab when the toggle changes.
 */

const toggle = document.getElementById("toggle");
const popupIcon = document.getElementById("popup-icon");
const statusText = document.getElementById("status-text");

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
	const url = tab?.url || "";
	const onLinkedIn = url.startsWith("https://www.linkedin.com/");

	chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
		toggle.checked = enabled;
		popupIcon.src = onLinkedIn && enabled
			? "icons/icon48.png"
			: "icons/icon48-bw.png";

		if (!onLinkedIn) {
			toggle.disabled = true;
			document.body.classList.add("off-site");
			statusText.textContent = "Available on linkedin.com";
			return;
		}

		document.body.classList.toggle("active", enabled);
		statusText.textContent = enabled
			? "Active on linkedin.com"
			: "Disabled on linkedin.com";

		toggle.addEventListener("change", () => {
			const on = toggle.checked;
			chrome.storage.local.set({ enabled: on }, () => {
				if (tab?.id != null) chrome.tabs.reload(tab.id);
				window.close();
			});
		});
	});
});
