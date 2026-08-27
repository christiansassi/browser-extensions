/**
 * Content script for the LinkedIn Promoted Remover extension.
 *
 * Resolve the localized promoted label from the LinkedIn locale bundle, then
 * remove every feed card carrying that label, both the cards present at load
 * and the ones LinkedIn appends while scrolling.
 */

(() => {
	"use strict";

	const PRELOAD_URL = "/preload/?_bprMode=vanilla";
	const CACHE_KEY = "promotedLabelCache";

	let observer = null;
	let promotedLabel = null;
	let pendingRoots = new Set();
	let scanScheduled = false;

	/**
	 * Report whether the current URL is the LinkedIn feed.
	 *
	 * @returns {boolean} True on the root path and on any /feed path.
	 */
	const isFeedPage = () =>
		location.pathname === "/" || location.pathname.startsWith("/feed");

	/**
	 * Decode the escape sequences of a JavaScript string literal.
	 *
	 * @param {string} value - Body of the literal, without the surrounding quotes.
	 * @returns {string} Decoded text, or value unchanged when it does not parse.
	 */
	function decodeJsString(value) {
		try {
			return JSON.parse(`"${value}"`);
		} catch {
			return value;
		}
	}

	/**
	 * Find the URL of the LinkedIn support locale bundle in the preload HTML.
	 *
	 * @param {string} preloadHtml - HTML returned by the preload endpoint.
	 * @returns {string|null} Absolute URL of the bundle, or null when the script tag
	 *   is absent.
	 */
	function extractSupportUrl(preloadHtml) {
		const tag = preloadHtml.match(
			/<script\b(?=[^>]*\bid=["']support-locale-module["'])[^>]*>/i
		)?.[0];

		const src = tag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
		return src ? new URL(src, location.href).href : null;
	}

	/**
	 * Read the localized promoted label out of a locale bundle.
	 *
	 * @param {string} source - Source of the support locale bundle.
	 * @returns {string|null} The label when the bundle defines exactly one
	 *   i18n_promoted value, null otherwise.
	 */
	function extractPromotedLabel(source) {
		const values = new Set();
		const re = /["']?i18n_promoted["']?\s*:\s*"((?:\\.|[^"\\])*)"/g;

		for (const match of source.matchAll(re)) {
			values.add(decodeJsString(match[1]));
		}

		return values.size === 1 ? [...values][0] : null;
	}

	/**
	 * Read the label cached for one locale bundle.
	 *
	 * @param {string} supportUrl - URL the label was resolved from.
	 * @returns {Promise<string|null>} Cached label, or null when none is cached.
	 */
	async function getCachedLabel(supportUrl) {
		const result = await chrome.storage.local.get({ [CACHE_KEY]: {} });
		return result[CACHE_KEY]?.[supportUrl] || null;
	}

	/**
	 * Cache the label for one locale bundle, keeping the eight most recent entries.
	 *
	 * @param {string} supportUrl - URL the label was resolved from.
	 * @param {string} label - Localized promoted label to store.
	 * @returns {Promise<void>} Resolves once the cache is written.
	 */
	async function cacheLabel(supportUrl, label) {
		const result = await chrome.storage.local.get({ [CACHE_KEY]: {} });
		const cache = result[CACHE_KEY] || {};

		cache[supportUrl] = label;

		const keys = Object.keys(cache);
		while (keys.length > 8) {
			delete cache[keys.shift()];
		}

		await chrome.storage.local.set({ [CACHE_KEY]: cache });
	}

	/**
	 * Resolve the localized promoted label for the current session.
	 *
	 * Fetch the preload page, locate the support locale bundle, and read the label
	 * from it, using the cache when that bundle was already seen.
	 *
	 * @returns {Promise<string>} The localized label.
	 * @throws {Error} When a request fails or no unique label can be resolved.
	 */
	async function resolvePromotedLabel() {
		const preloadResponse = await fetch(PRELOAD_URL, {
			credentials: "same-origin",
			cache: "force-cache"
		});

		if (!preloadResponse.ok) {
			throw new Error(`preload request failed (${preloadResponse.status})`);
		}

		const preloadHtml = await preloadResponse.text();
		const supportUrl = extractSupportUrl(preloadHtml);

		if (!supportUrl) {
			throw new Error("support-locale-module was not found in LinkedIn preload HTML");
		}

		const cached = await getCachedLabel(supportUrl);
		if (cached) return cached;

		const supportResponse = await fetch(supportUrl, {
			cache: "force-cache",
			credentials: "omit"
		});

		if (!supportResponse.ok) {
			throw new Error(`support locale request failed (${supportResponse.status})`);
		}

		const source = await supportResponse.text();
		const label = extractPromotedLabel(source);

		if (!label) {
			throw new Error("could not resolve a unique i18n_promoted value");
		}

		await cacheLabel(supportUrl, label);
		return label;
	}

	/**
	 * Report whether a piece of text is the promoted metadata.
	 *
	 * @param {string} text - Text content of a candidate element.
	 * @returns {boolean} True when the text is the label itself or the label
	 *   followed by further metadata.
	 */
	function matchesPromotedText(text) {
		const value = text.trim();
		return value === promotedLabel || value.startsWith(`${promotedLabel} `);
	}

	/**
	 * Report whether a span is the promoted marker of a feed card.
	 *
	 * @param {Element} span - Candidate element found inside a card.
	 * @returns {boolean} True when the span carries the promoted label as card
	 *   metadata rather than as body text.
	 */
	function isPromotedMarker(span) {
		if (!(span instanceof HTMLSpanElement)) return false;
		if (!matchesPromotedText(span.textContent)) return false;

		// Do not interpret post/comment body text as metadata.
		if (span.closest('[data-testid="expandable-text-box"]')) return false;

		const paragraph = span.closest("p");
		if (!paragraph || !matchesPromotedText(paragraph.textContent)) return false;

		return true;
	}

	/**
	 * Remove the feed card that contains a promoted marker.
	 *
	 * @param {HTMLSpanElement} span - Marker span inside the card.
	 * @returns {boolean} True when a card was removed, false when the span is not
	 *   inside one.
	 */
	function removePostFromMarker(span) {
		const post = span.closest('[role="listitem"]');
		if (!post) return false;

		// The lazy-mount wrapper is LinkedIn's outer container for a feed card.
		// Removing it avoids leaving an empty wrapper behind. Fall back to the
		// list item if LinkedIn changes that outer structure.
		const mount = post.closest("[data-lazy-mount-id]");
		(mount || post).remove();
		return true;
	}

	/**
	 * Remove one feed card when it is a promoted post.
	 *
	 * @param {Element} post - Feed card to inspect.
	 * @returns {void} Nothing. A promoted card is removed from the document.
	 */
	function scanPost(post) {
		if (!promotedLabel || !isFeedPage()) return;
		if (!(post instanceof Element) || !post.isConnected) return;
		if (post.getAttribute("role") !== "listitem") return;

		// Restrict matching to direct spans inside paragraphs. LinkedIn renders
		// the promoted metadata as <p><span>...</span></p>, so there is no need
		// to read or scan every text node in the card.
		for (const span of post.querySelectorAll("p > span")) {
			if (isPromotedMarker(span) && removePostFromMarker(span)) return;
		}
	}

	/**
	 * Queue one feed card for the next scan.
	 *
	 * @param {Element} post - Candidate card. Anything that is not a feed card is
	 *   ignored.
	 * @returns {void} Nothing.
	 */
	function addPendingPost(post) {
		if (!(post instanceof Element)) return;
		if (post.getAttribute("role") !== "listitem") return;
		pendingRoots.add(post);
	}

	/**
	 * Queue every feed card affected by one inserted node.
	 *
	 * @param {Node} node - Node LinkedIn added to the document.
	 * @returns {void} Nothing.
	 */
	function collectPostsFromAddedNode(node) {
		if (!(node instanceof Element)) return;

		// If LinkedIn updated an already-mounted card, inspect only that card.
		const parentPost = node.closest('[role="listitem"]');
		if (parentPost) {
			addPendingPost(parentPost);
			return;
		}

		// Otherwise LinkedIn may have inserted a wrapper containing one or more
		// complete cards. Queue only those cards, never the wrapper itself.
		if (node.matches('[role="listitem"]')) addPendingPost(node);
		for (const post of node.querySelectorAll('[role="listitem"]')) {
			addPendingPost(post);
		}
	}

	/**
	 * Queue one scan of the cards waiting to be inspected.
	 *
	 * Calls made before that scan runs collapse into a single pass.
	 *
	 * @returns {void} Nothing.
	 */
	function scheduleScan() {
		if (scanScheduled) return;
		scanScheduled = true;

		// Batch all mutations from the current DOM update into one lightweight
		// pass without tying the work to every animation frame.
		setTimeout(() => {
			scanScheduled = false;
			const posts = pendingRoots;
			pendingRoots = new Set();

			for (const post of posts) scanPost(post);
		}, 0);
	}

	/**
	 * Scan every feed card currently in the document.
	 *
	 * @returns {void} Nothing.
	 */
	function scanExistingPosts() {
		for (const post of document.querySelectorAll('[role="listitem"]')) {
			scanPost(post);
		}
	}

	/**
	 * Watch the feed for cards added while scrolling, then scan the ones present.
	 *
	 * @returns {void} Nothing.
	 */
	function startObserver() {
		observer = new MutationObserver((mutations) => {
			if (!isFeedPage()) return;

			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType === Node.ELEMENT_NODE) {
						collectPostsFromAddedNode(node);
					} else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
						const post = node.parentElement.closest('[role="listitem"]');
						if (post) addPendingPost(post);
					}
				}
			}

			if (pendingRoots.size) scheduleScan();
		});

		// Start observing first to avoid a race, then scan cards already present
		// when the extension initializes. Do not observe characterData, since
		// LinkedIn changes text constantly and watching it is costly.
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true
		});

		scanExistingPosts();
	}

	/**
	 * Resolve the promoted label and start removing cards.
	 *
	 * @returns {Promise<void>} Resolves once the observer runs, or immediately when
	 *   the label cannot be resolved.
	 */
	async function start() {
		try {
			promotedLabel = await resolvePromotedLabel();
			startObserver();
		} catch {
			// Fail silently if LinkedIn changes its preload or localization format.
		}
	}


	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type !== "rescan") return;

		if (promotedLabel) {
			scanExistingPosts();
			requestAnimationFrame(scanExistingPosts);
		}

		sendResponse({ ok: true });
	});

	chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
		const active = !!enabled;

		// Report the real state of this page load. The background service worker
		// uses it for the same per-tab persistence/sync behavior as the ChatGPT
		// extension. Refreshing the page simply re-reads the saved toggle state.
		chrome.runtime.sendMessage({ type: "report", active }, () => {
			void chrome.runtime.lastError;
		});

		if (active) start();
	});
})();
