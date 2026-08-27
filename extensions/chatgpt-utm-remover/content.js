/**
 * Content script for the ChatGPT UTM Remover extension.
 *
 * Rewrite every anchor on the page whose href carries a ChatGPT utm_source
 * parameter, keep rewriting as ChatGPT renders new messages, and report to the
 * service worker whether the cleanup activated on this page load.
 */

(() => {
	"use strict";

	/**
	 * Report whether a utm_source value belongs to ChatGPT.
	 *
	 * @param {string|null} value - Value of the utm_source parameter.
	 * @returns {boolean} True when the value starts with "chatgpt".
	 */
	const shouldStrip = (value) =>
		value && value.toLowerCase().startsWith("chatgpt");

	/**
	 * Rewrite one anchor when its href carries a ChatGPT utm_source parameter.
	 *
	 * @param {HTMLAnchorElement} a - Anchor to inspect.
	 * @returns {void} Nothing. The href attribute is updated in place.
	 */
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

	/**
	 * Clean every anchor currently in the document.
	 *
	 * @returns {void} Nothing.
	 */
	function sweep() {
		document.querySelectorAll('a[href*="utm_source"]').forEach(cleanAnchor);
	}

	let pending = false;
	/**
	 * Queue one sweep for the next animation frame.
	 *
	 * Calls made before that frame collapse into a single sweep.
	 *
	 * @returns {void} Nothing.
	 */
	function scheduleSweep() {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			sweep();
		});
	}

	/**
	 * Run the first sweep and watch the page for anchors added later.
	 *
	 * Observe node insertions and href changes, and sweep again after scrolling,
	 * which is when ChatGPT appends older messages.
	 *
	 * @returns {void} Nothing.
	 */
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

	// Read the setting, report to the background whether the cleanup activated
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
