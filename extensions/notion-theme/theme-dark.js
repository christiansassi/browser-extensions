(() => {
  const FORCED_THEME = "dark";
  const nativeMatchMedia = window.matchMedia.bind(window);

  const themeResult = (query, nativeValue) => {
    const hasLight = /prefers-color-scheme\s*:\s*light/i.test(query);
    const hasDark = /prefers-color-scheme\s*:\s*dark/i.test(query);
    if (hasLight && !hasDark) return FORCED_THEME === "light";
    if (hasDark && !hasLight) return FORCED_THEME === "dark";
    return nativeValue;
  };

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

  const applyColorScheme = () => {
    if (document.documentElement) document.documentElement.style.colorScheme = FORCED_THEME;
  };

  applyColorScheme();
  document.addEventListener("readystatechange", applyColorScheme, { once: true });
})();
