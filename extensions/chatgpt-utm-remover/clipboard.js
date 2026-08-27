(() => {
	"use strict";

	// Set by content.js only when the extension is enabled.
	const active = () => document.documentElement.dataset.utmRemover === "on";

	function cleanUrl(raw) {
		try {
			const url = new URL(raw);
			const value = url.searchParams.get("utm_source");
			if (!value || !value.toLowerCase().startsWith("chatgpt")) return raw;
			url.searchParams.delete("utm_source");
			return url.toString().replace(/\?$/, "");
		} catch {
			return raw;
		}
	}

	function cleanText(text) {
		if (typeof text !== "string" || text.indexOf("utm_source") === -1) return text;
		return text.replace(/https?:\/\/[^\s<>"'`)\]]+/g, cleanUrl);
	}

	const clip = navigator.clipboard;
	if (!clip) return;

	if (typeof clip.writeText === "function") {
		const original = clip.writeText.bind(clip);
		clip.writeText = (text) =>
			original(active() ? cleanText(String(text)) : text);
	}

	// The "copy message" button writes rich items rather than plain text.
	if (typeof clip.write === "function" && typeof ClipboardItem !== "undefined") {
		const original = clip.write.bind(clip);
		clip.write = async (items) => {
			if (!active()) return original(items);
			const out = [];
			for (const item of items) {
				const parts = {};
				for (const type of item.types) {
					const blob = await item.getType(type);
					if (type === "text/plain" || type === "text/html") {
						parts[type] = new Blob([cleanText(await blob.text())], { type });
					} else {
						parts[type] = blob;
					}
				}
				out.push(new ClipboardItem(parts));
			}
			return original(out);
		};
	}

	// Fallback for selecting text and pressing Ctrl+C.
	document.addEventListener(
		"copy",
		(event) => {
			if (!active() || !event.clipboardData) return;
			const selection = String(window.getSelection() || "");
			if (!selection || selection.indexOf("utm_source") === -1) return;
			const cleaned = cleanText(selection);
			if (cleaned === selection) return;
			event.clipboardData.setData("text/plain", cleaned);
			event.preventDefault();
		},
		true
	);
})();
