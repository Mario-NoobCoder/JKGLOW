/*!
 * JK Glow — theme persistence.
 *
 * Loaded synchronously from <head> so `data-theme` is set on <html> before the
 * first paint. That ordering is what prevents a flash of the wrong theme.
 *
 * Exposes `window.jkglowTheme.sync()` so the client-side router in nav.js can
 * re-bind the toggle after it swaps the body.
 */
(function () {
  "use strict";

  var KEY = "jkglow-theme";
  var root = document.documentElement;
  var system = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var still = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  var release;

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      /* Private browsing or blocked storage: fall back to the OS preference. */
      return null;
    }
  }

  function resolve() {
    var value = stored();

    if (value !== "light" && value !== "dark") value = system && system.matches ? "dark" : "light";

    return value;
  }

  /*
   * Colour changes are animated by `.theme-anim` in src/input.css. The class is
   * removed once the switch is over so it cannot sit on top of the hover
   * transitions that links and cards already declare.
   */
  function flashThemeColours() {
    if (still.matches) return;

    root.classList.add("theme-anim");

    /*
     * Force the browser to resolve the current colours with the transition in
     * place. Without this flush the theme flips in the same frame the class is
     * added, and nothing animates.
     */
    void root.offsetWidth;

    window.clearTimeout(release);

    release = window.setTimeout(function () {
      root.classList.remove("theme-anim");
    }, 420);
  }

  function syncCheckbox(theme) {
    var box = document.getElementById("jkglow-theme");

    if (box) box.checked = theme === "dark";
  }

  function commit(theme) {
    /* Arm the transition before the colours change, not after. */
    flashThemeColours();

    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {
      /* Nothing to do; the choice still holds for this page. */
    }

    syncCheckbox(theme);
  }

  function attach() {
    var box = document.getElementById("jkglow-theme");

    if (!box || box.dataset.bound) return;

    box.dataset.bound = "1";

    box.addEventListener("change", function () {
      commit(box.checked ? "dark" : "light");
    });
  }

  /* Runs before the body exists, so there is no checkbox to bind yet. */
  root.dataset.theme = resolve();
  root.style.colorScheme = root.dataset.theme;

  function onSystemChange(event) {
    /* Only follow the OS while the visitor has made no explicit choice. */
    if (!stored()) commit(event.matches ? "dark" : "light");
  }

  window.jkglowTheme = {
    sync: function () {
      syncCheckbox(root.dataset.theme);
      attach();
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    window.jkglowTheme.sync();

    if (!system) return;

    if (system.addEventListener) system.addEventListener("change", onSystemChange);
    else if (system.addListener) system.addListener(onSystemChange);
  });
})();
