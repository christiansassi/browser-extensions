/**
 * Mark public repository visibility badges in headers and repository lists.
 * Keep theme colors in CSS so theme switches take effect immediately.
 */

(() => {
	const selector = '.Label, [data-component="Label"], [class*="prc-Label-Label-"]';
	const attribute = "data-github-public-highlight";
	const repositoryContainers = [
		"#repository-container-header",
		'[data-testid="repo-header"]',
		'[data-testid="repository-header"]',
		"#user-repositories-list",
		".pinned-item-list-item",
		'[data-testid="repos-list"]',
		'[data-testid="repository-list"]',
		'[itemprop="owns"]',
		".org-repos"
	].join(",");
	let scheduled = false;

	/**
	 * Identify visibility badges beside repository links in newer list layouts.
	 * @param {Element} badge - Candidate label element from the document.
	 * @returns {boolean} True inside a repository container or beside its link.
	 */
	function isRepositoryBadge(badge) {
		if (badge.closest('.markdown-body, .comment-body, [data-testid="issue-body"]')) return false;
		if (badge.hasAttribute("data-listview-item-visibility-label")) return true;
		if (badge.closest(repositoryContainers)) return true;
		let parent = badge.parentElement;
		for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
			for (const link of parent.querySelectorAll("a[href]")) {
				let url;
				try {
					url = new URL(link.getAttribute("href"), location.href);
				} catch {
					continue;
				}
				if (url.origin !== location.origin || !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) continue;
				// These two-segment URLs describe site features, not repositories.
				if (/^\/(orgs|users|settings|topics|collections|marketplace|sponsors|features|search|issues|pulls|discussions)\//.test(url.pathname)) continue;
				return true;
			}
		}
		return false;
	}

	/**
	 * Update visibility badges without matching private badges or Markdown prose.
	 * @returns {void}
	 */
	function highlightPublicBadge() {
		scheduled = false;
		for (const badge of document.querySelectorAll(`[${attribute}]`)) {
			if (!badge.matches(selector) || badge.textContent.trim() !== "Public" || !isRepositoryBadge(badge)) {
				badge.removeAttribute(attribute);
			}
		}
		for (const badge of document.querySelectorAll(selector)) {
			if (badge.textContent.trim() === "Public" && isRepositoryBadge(badge)) {
				badge.setAttribute(attribute, "");
			}
		}
	}

	/**
	 * Batch DOM changes into one scan per animation frame.
	 * @returns {void}
	 */
	function scheduleHighlight() {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(highlightPublicBadge);
	}

	/**
	 * Load the toggle and report the state actually applied to this page.
	 * @returns {Promise<void>} Resolve after setting up the enabled highlighter.
	 */
	async function initialize() {
		const { enabled } = await chrome.storage.local.get({ enabled: true });
		if (enabled) {
			highlightPublicBadge();
			new MutationObserver(scheduleHighlight).observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true
			});
		}
		try {
			await chrome.runtime.sendMessage({
				type: "report",
				active: !!enabled,
				version: chrome.runtime.getManifest().version
			});
		} catch {
			// Reloading the extension can invalidate an existing page's connection.
		}
	}

	void initialize();
})();
