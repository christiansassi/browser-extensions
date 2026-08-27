/**
 * Main world script for the Notion Theme extension, light variant.
 *
 * Answer every prefers-color-scheme query as light and set the color scheme of
 * the document, so Notion renders in light mode whatever the browser reports.
 */

(() => {
	const FORCED_THEME = "light";
	const nativeMatchMedia = window.matchMedia.bind(window);

	/**
	 * Resolve what a media query reports under the forced theme.
	 *
	 * @param {string} query - Media query text passed to matchMedia.
	 * @param {boolean} nativeValue - Result the browser would return on its own.
	 * @returns {boolean} Forced result for a prefers-color-scheme query, and
	 *   nativeValue for any other query.
	 */
	const themeResult = (query, nativeValue) => {
		const hasLight = /prefers-color-scheme\s*:\s*light/i.test(query);
		const hasDark = /prefers-color-scheme\s*:\s*dark/i.test(query);
		if (hasLight && !hasDark) return FORCED_THEME === "light";
		if (hasDark && !hasLight) return FORCED_THEME === "dark";
		return nativeValue;
	};

	/**
	 * Replace matchMedia so color scheme queries follow the forced theme.
	 *
	 * @param {string} query - Media query text.
	 * @returns {MediaQueryList} The native result for an unrelated query, and a
	 *   proxy reporting the forced theme for a color scheme query.
	 */
	window.matchMedia = (query) => {
		const mql = nativeMatchMedia(query);
		if (!/prefers-color-scheme/i.test(query)) return mql;

		return new Proxy(mql, {
			get(target, prop) {
				if (prop === "matches") return themeResult(query, target.matches);
				if (prop === "media") return query;
				if (prop === "onchange") return null;
				if (prop === "addEventListener" || prop === "removeEventListener" ||
						prop === "addListener" || prop === "removeListener") {
					return () => {};
				}
				const value = Reflect.get(target, prop, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
			set(target, prop, value) {
				if (prop === "onchange") return true;
				return Reflect.set(target, prop, value, target);
			}
		});
	};

	/**
	 * Set the color scheme of the document to the forced theme.
	 *
	 * @returns {void} Nothing.
	 */
	const applyColorScheme = () => {
		if (document.documentElement) document.documentElement.style.colorScheme = FORCED_THEME;
	};

	applyColorScheme();
	document.addEventListener("readystatechange", applyColorScheme, { once: true });
})();
