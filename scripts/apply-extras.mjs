/**
 * Page furniture the motion and navigation layers hook into: the
 * view-transition names, prefetch hints on the language switch, a scrolling
 * category ticker, and the decorative orbs.
 *
 * Every rule is idempotent. Run: node scripts/apply-extras.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP = ["node_modules", ".git", ".idea", "src", "scripts", "assets"];

const TICKER = {
  en: "Serums · Creams · Toners · Masks · Pharmacies · Beauty institutes · Concept stores · Retailers · Antananarivo · Toamasina · Madagascar",
  fr: "Sérums · Crèmes · Toniques · Masques · Pharmacies · Instituts de beauté · Magasins concepts · Détaillants · Antananarivo · Toamasina · Madagascar",
};

const TICKER_LABEL = { en: "Categories and channels", fr: "Catégories et canaux" };

/* The full-bleed dark section, where drifting shapes read as light. */
const DARK_SECTION = '<section class="relative isolate overflow-hidden bg-ink-950 text-white">';

/*
 * The strip carries real content, so it stays readable: the first set is
 * announced, the copy that makes the loop seamless is hidden.
 */
function tickerStrip(lang) {
  const items = TICKER[lang];
  const label = TICKER_LABEL[lang];
  const first = '<span class="ticker-set">' + items + "</span>";
  const second = '<span class="ticker-set" aria-hidden="true">' + items + "</span>";

  return [
    '<div class="ticker-strip" aria-label="' + label + '">',
    '\t<div class="ticker-track">',
    "\t\t" + first,
    "\t\t" + second,
    "\t</div>",
    "</div>",
  ].join("\n");
}

const ORBS = [
  '<div class="ambient" aria-hidden="true">',
  '\t<span class="orb orb-a blob parallax-drift"></span>',
  '\t<span class="orb orb-b blob parallax-drift"></span>',
  '\t<span class="orb-ring parallax-spin"></span>',
  "</div>",
].join("\n");

/** Names the shared elements the cross-document transition morphs. */
function addViewTransitionNames(html) {
  let brands = 0;
  let titles = 0;

  /*
   * A view-transition name must be unique inside a document: a duplicate makes
   * the browser drop the transition. The footer repeats the logo, so only the
   * first match keeps the name.
   */
  const withBrands = html.replace(
    /class="(brand-mark )?(grid h-9 w-9 place-items-center rounded-xl bg-ink-900[^"]*)"/g,
    (m, tagged, rest) => {
      brands++;

      if (brands > 1) return 'class="' + rest + '"';

      return tagged ? m : 'class="brand-mark ' + rest + '"';
    }
  );

  return withBrands.replace(
    /class="(page-title text-mask )?(enter-mask mt-7 font-display text-display-1 font-semibold)"/g,
    (m, tagged, rest) => {
      titles++;

      if (titles > 1) return 'class="' + rest + '"';

      return tagged ? m : 'class="page-title text-mask ' + rest + '"';
    }
  );
}

/** Warm the sibling language page so the switch does not wait on the network. */
function addPrefetch(html) {
  const at = html.indexOf('<div class="lang-switch"');

  if (at === -1) return html;

  const end = html.indexOf("</div>", at);

  if (end === -1) return html;

  const block = html.slice(at, end);

  const patched = block.replace(/<a\b([^>]*)>/g, (m, attrs) => {
    /* The current language has nothing to warm. */
    if (/aria-current="true"/.test(attrs) || /\brel=/.test(attrs)) return m;

    return '<a' + attrs + ' rel="prefetch">';
  });

  return html.slice(0, at) + patched + html.slice(end);
}

function addTicker(html, lang) {
  if (html.includes("ticker-strip")) return html;

  for (const anchor of ['<section class="section-y" id="brands"', '<section id="brands"']) {
    if (!html.includes(anchor)) continue;

    return html.replace(anchor, tickerStrip(lang) + "\n\n" + anchor);
  }

  return html;
}

function addOrbs(html) {
  if (html.includes('class="ambient"')) return html;
  if (!html.includes(DARK_SECTION)) return html;

  const at = html.indexOf(DARK_SECTION) + DARK_SECTION.length;

  return html.slice(0, at) + "\n\t" + ORBS + html.slice(at);
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.includes(entry)) continue;

    const full = join(dir, entry);

    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }

  return found;
}

let touched = 0;

for (const file of walk(root)) {
  const original = readFileSync(file, "utf8");
  const lang = /\/fr[\\/]/.test(file) || file.includes(`${sep}fr${sep}`) ? "fr" : "en";

  let html = addViewTransitionNames(original);

  html = addPrefetch(html);
  html = addTicker(html, lang);
  html = addOrbs(html);

  if (html === original) continue;

  writeFileSync(file, html, "utf8");
  touched++;
  console.log("  ->  " + relative(root, file).split(sep).join("/"));
}

console.log("\n" + touched + " page(s) updated.");
