(() => {
	"use strict";

	const shouldStrip = (value) =>
		value && value.toLowerCase().startsWith("chatgpt");

	function cleanAnchor(a) {
		const raw = a.getAttribute("href");
		if (!raw || raw.indexOf("utm_source") === -1) return;

		let url;
		try {
			url = new URL(raw, location.href);
		} catch {
			return;
		}

		if (!shouldStrip(url.searchParams.get("utm_source"))) return;

		url.searchParams.delete("utm_source");
		const cleaned = url.toString().replace(/\?$/, "");
		if (cleaned !== raw) a.setAttribute("href", cleaned);
	}

	function sweep() {
		document.querySelectorAll('a[href*="utm_source"]').forEach(cleanAnchor);
	}

	let pending = false;
	function scheduleSweep() {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			sweep();
		});
	}

	function start() {
		sweep();

		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.type === "attributes" && m.target instanceof HTMLAnchorElement) {
					cleanAnchor(m.target);
				} else if (m.addedNodes && m.addedNodes.length) {
					scheduleSweep();
				}
			}
		});

		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["href"],
		});

		let scrollTimer = null;
		window.addEventListener(
			"scroll",
			() => {
				if (scrollTimer) return;
				scrollTimer = setTimeout(() => {
					scrollTimer = null;
					sweep();
				}, 200);
			},
			{ passive: true, capture: true }
		);
	}

	// Read the setting, tell the background whether we activated on this load
	// (used to detect out-of-sync tabs), then run if enabled. Toggling reloads
	// the tab, so this re-reads the fresh value every load.
	chrome.storage.local.get({ enabled: true }, (res) => {
		const active = !!res.enabled;
		chrome.runtime.sendMessage({ type: "report", active }, () => void chrome.runtime.lastError);

		// clipboard.js runs in the page context and reads this flag.
		if (active) {
			document.documentElement.dataset.utmRemover = "on";
		} else {
			delete document.documentElement.dataset.utmRemover;
		}

		if (active) start();
	});
})();
