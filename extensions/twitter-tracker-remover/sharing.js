/**
 * Clean outgoing post links in the page's clipboard and native share APIs.
 */

(() => {
	"use strict";

	const active = () => document.documentElement?.dataset.twitterTrackerRemover === "on";
	const hosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
	const postPath = /^\/(?:[a-z0-9_]+\/status|i\/(?:web\/)?status)\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/i;

	/** Remove the question mark and everything after it from a post URL. */
	function cleanUrl(raw) {
		if (typeof raw !== "string" || !raw.includes("?")) return raw;
		try {
			const url = new URL(raw);
			if (!hosts.has(url.hostname) || !postPath.test(url.pathname)) return raw;
			if (url.protocol !== "https:" && url.protocol !== "http:") return raw;
			const query = raw.indexOf("?");
			const hash = raw.indexOf("#");
			if (hash !== -1 && hash < query) return raw;
			return raw.slice(0, query);
		} catch {
			return raw;
		}
	}

	/** Keep surrounding text, HTML, punctuation, and unrelated URLs intact. */
	function cleanText(text) {
		if (typeof text !== "string" || !text.includes("?")) return text;
		if (/^https?:\/\/[^\s<>"'`]+$/i.test(text)) return cleanUrl(text);
		return text.replace(/https?:\/\/[^\s<>"'`)\]}]+/gi, (raw) => {
			const [, url, punctuation] = /^(.*?)([.,;!:]*)$/.exec(raw);
			return cleanUrl(url) + punctuation;
		});
	}

	const clipboard = navigator.clipboard;
	if (typeof clipboard?.writeText === "function") {
		const original = clipboard.writeText.bind(clipboard);
		clipboard.writeText = (text) => original(active() ? cleanText(String(text)) : text);
	}

	if (typeof clipboard?.write === "function" && typeof ClipboardItem !== "undefined") {
		const original = clipboard.write.bind(clipboard);
		clipboard.write = (items) => {
			if (!active()) return original(items);
			const cleaned = Array.from(items, (item) => {
				const parts = {};
				for (const type of item.types) {
					// Pass promises straight to write() to preserve user activation.
					parts[type] = item.getType(type).then(async (blob) => {
						if (type !== "text/plain" && type !== "text/html") return blob;
						return new Blob([cleanText(await blob.text())], { type });
					});
				}
				return new ClipboardItem(parts, { presentationStyle: item.presentationStyle });
			});
			return original(cleaned);
		};
	}

	if (typeof navigator.share === "function") {
		const original = navigator.share.bind(navigator);
		navigator.share = (data) => {
			if (!active() || !data) return original(data);
			const cleaned = { ...data };
			if (typeof data.url === "string") cleaned.url = cleanUrl(data.url);
			if (typeof data.text === "string") cleaned.text = cleanText(data.text);
			return original(cleaned);
		};
	}

	// Handle legacy copy buttons and Ctrl+C, including hidden textareas.
	window.addEventListener("copy", (event) => {
		if (!active() || !event.clipboardData) return;
		const data = event.clipboardData;
		const setData = data.setData.bind(data);
		// Page handlers may write their own data and stop event propagation.
		data.setData = (type, text) => setData(type,
			type === "text/plain" || type === "text/html" ? cleanText(text) : text);
		let changed = false;
		for (const type of ["text/plain", "text/html"]) {
			const text = data.getData(type);
			const cleaned = cleanText(text);
			if (cleaned !== text) {
				data.setData(type, cleaned);
				changed = true;
			}
		}

		if (!event.defaultPrevented && data.types.length === 0) {
			const element = document.activeElement;
			const selection = typeof element?.selectionStart === "number"
				? element.value.slice(element.selectionStart, element.selectionEnd)
				: String(window.getSelection() || "");
			const cleaned = cleanText(selection);
			if (cleaned !== selection) {
				data.setData("text/plain", cleaned);
				changed = true;
			}
		}
		if (changed) event.preventDefault();
	}, true);
})();
