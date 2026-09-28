/*!
 * JK Glow — client-side navigation.
 *
 * The site is a set of static documents and stays one: every page is fully
 * readable with JavaScript disabled, and this file only removes the full page
 * load from an ordinary link click. It fetches the target document, swaps the
 * body, and re-binds the few things that need binding.
 *
 * Progressive enhancement by construction. If anything here fails, `navigate`
 * falls back to `location.assign` and the browser does what it always did.
 */
(function () {
  "use strict";

  var cache = new Map();
  var pending = new Map();
  var root = document.documentElement;

  /* Attributes that belong to a specific page and must follow the swap. */
  var HEAD_SYNC = [
    ["link[rel='canonical']", "href"],
    ["link[rel='alternate'][hreflang]", "href"],
    ["meta[name='description']", "content"],
    ["meta[property='og:url']", "content"],
    ["meta[property='og:title']", "content"],
    ["meta[property='og:description']", "content"],
    ["meta[name='twitter:title']", "content"],
    ["meta[name='twitter:description']", "content"],
  ];

  /*
   * Both audiences reach the same form, so the link that brings them there
   * carries the answer: ?type=brand for a Korean manufacturer, ?interest=
   * retailer for a shop that wants to stock us. The option values are
   * translated, so the mapping is written per language.
   */
  var PREFILL = {
    en: {
      brand: { biztype: "Korean Beauty Brand", interest: "Distribution partnership" },
      retailer: { interest: "Becoming a retailer" },
    },
    fr: {
      brand: { biztype: "Korean Beauty Brand", interest: "Partenariat de distribution" },
      retailer: { interest: "Devenir revendeur" },
    },
  };

  function isPlainLeftClick(event) {
    return (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    );
  }

  function internalHref(link) {
    var href = link.getAttribute("href");

    if (!href || href.charAt(0) === "#") return null;
    if (link.hasAttribute("download") || link.hasAttribute("target")) return null;

    var url;

    try {
      url = new URL(href, location.href);
    } catch (e) {
      return null;
    }

    if (url.origin !== location.origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    return url;
  }

  /* The current page, ignoring any fragment. */
  function sameDocument(url) {
    return url.pathname === location.pathname && url.search === location.search;
  }

  /* Skip the current page: swapping it would be a pointless re-render. */
  function isCurrent(url) {
    return sameDocument(url) && url.hash === location.hash;
  }

  function load(url) {
    var key = url.href;

    if (cache.has(key)) return Promise.resolve(cache.get(key));

    /* A click that lands mid-prefetch reuses the request already in flight. */
    if (pending.has(key)) return pending.get(key);

    var promise = fetch(key, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error(response.status + " " + response.statusText);

        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");

        cache.set(key, doc);
        return doc;
      })
      .finally(function () {
        pending.delete(key);
      });

    pending.set(key, promise);

    return promise;
  }

  /** Warm the cache so the click lands on an already-parsed document. */
  function prefetch(link) {
    var url = internalHref(link);

    if (!url || isCurrent(url) || cache.has(url.href)) return;

    load(url).catch(function () {
      /* A failed prefetch is not worth reporting; the click will retry. */
    });
  }

  function syncHead(doc) {
    root.lang = doc.documentElement.lang || root.lang;

    HEAD_SYNC.forEach(function (pair) {
      var selector = pair[0];
      var attribute = pair[1];
      var from = doc.querySelector(selector);
      var to = document.querySelector(selector);

      if (from && to) to.setAttribute(attribute, from.getAttribute(attribute));
    });

    /*
     * Each language advertises its own alternate, so every one of them has to
     * follow the swap, not just the first.
     */
    var fromAlternates = doc.querySelectorAll("link[rel='alternate'][hreflang]");
    var toAlternates = document.querySelectorAll("link[rel='alternate'][hreflang]");

    for (var i = 0; i < fromAlternates.length && i < toAlternates.length; i++) {
      toAlternates[i].setAttribute("href", fromAlternates[i].getAttribute("href"));
    }
  }

  function render(doc) {
    syncHead(doc);

    document.title = doc.title;
    document.body.innerHTML = doc.body.innerHTML;

    /* The swapped body holds a fresh theme checkbox. */
    if (window.jkglowTheme) window.jkglowTheme.sync();

    var id = location.hash.slice(1);
    var target = id && document.getElementById(id);

    /* The swapped body is a fresh form, so the query string applies again. */
    applyPrefill(new URL(location.href));

    if (target) target.scrollIntoView({ behavior: "instant", block: "start" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }

  /** Preselect what the query string already told us, and nothing more. */
  function applyPrefill(url) {
    var table = PREFILL[document.documentElement.lang] || PREFILL.en;
    var wanted = null;

    if (url.searchParams.get("type") === "brand") wanted = table.brand;
    else if (url.searchParams.get("interest") === "retailer") wanted = table.retailer;

    if (!wanted) return;

    Object.keys(wanted).forEach(function (id) {
      var select = document.getElementById(id);

      if (!select) return;

      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === wanted[id]) {
          select.value = wanted[id];
          return;
        }
      }
    });
  }

  function withTransition(update) {
    /* Same-document animation when available, plain swap otherwise. */
    if (typeof document.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return Promise.resolve();
    }

    return document.startViewTransition(update).finished.catch(function () {
      /* A cancelled transition still leaves the DOM in its final state. */
    });
  }

  function navigate(url, push) {
    /* Kept on for the whole fetch and swap, so the wait is always visible. */
    root.classList.add("is-navigating");

    return load(url)
      .then(function (doc) {
        return withTransition(function () {
          if (push) history.pushState({ url: url.href }, "", url.href);

          render(doc);
        });
      })
      .catch(function () {
        /* Any failure falls back to a normal navigation. */
        location.assign(url.href);
      })
      .finally(function () {
        root.classList.remove("is-navigating");
      });
  }

  /** A link to a fragment on the page already open: scroll, never re-render. */
  function scrollToHash(url, push) {
    if (push) history.pushState({ url: url.href }, "", url.href);

    var target = document.getElementById(url.hash.slice(1));

    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", function (event) {
    if (!isPlainLeftClick(event)) return;

    var link = event.target.closest ? event.target.closest("a[href]") : null;

    if (!link) return;

    var url = internalHref(link);

    if (!url || isCurrent(url)) return;

    event.preventDefault();

    if (sameDocument(url) && url.hash) scrollToHash(url, true);
    else navigate(url, true);
  });

  document.addEventListener("pointerover", function (event) {
    var link = event.target.closest ? event.target.closest("a[href]") : null;

    if (link) prefetch(link);
  });

  document.addEventListener("focusin", function (event) {
    var link = event.target.closest ? event.target.closest("a[href]") : null;

    if (link) prefetch(link);
  });

  window.addEventListener("popstate", function () {
    var url = new URL(location.href);

    if (sameDocument(url)) scrollToHash(url, false);
    else navigate(url, false);
  });

  /* A cold load of contact.html?type=brand lands with the form preselected. */
  applyPrefill(new URL(location.href));
})();
