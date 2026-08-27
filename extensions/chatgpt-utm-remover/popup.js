const toggle = document.getElementById("toggle");
const popupIcon = document.getElementById("popup-icon");
const statusText = document.getElementById("status-text");

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
	const url = tab?.url || "";
	const onChatGPT = url.startsWith("https://chatgpt.com/");

	chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
		toggle.checked = enabled;
		popupIcon.src = onChatGPT && enabled
			? "icons/icon48.png"
			: "icons/icon48-bw.png";

		if (!onChatGPT) {
			toggle.disabled = true;
			document.body.classList.add("off-site");
			statusText.textContent = "Available on chatgpt.com";
			return;
		}

		document.body.classList.toggle("active", enabled);
		statusText.textContent = enabled
			? "Active on chatgpt.com"
			: "Disabled on chatgpt.com";

		toggle.addEventListener("change", () => {
			const on = toggle.checked;
			chrome.storage.local.set({ enabled: on }, () => {
				if (tab?.id != null) chrome.tabs.reload(tab.id);
				window.close();
			});
		});
	});
});
