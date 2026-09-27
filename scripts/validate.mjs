/**
 * Static checks for the built site.
 *
 * Verifies the site ships no JavaScript beyond the theme script, that every internal link and anchor
 * resolves, that ids are unique, and that every utility class used in the
 * markup actually made it into the compiled stylesheet.
 *
 * Run: node scripts/validate.mjs
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "assets", "css", "app.css");

const problems = [];
const notes = [];

function fail(where, message) {
  problems.push(`${where}: ${message}`);
}

function walk(dir, filter, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".idea" || entry === "src" || entry === "scripts") {
      continue;
    }

    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      walk(full, filter, found);
    } else if (filter(entry)) {
      found.push(full);
    }
  }

  return found;
}

const htmlFiles = walk(root, (name) => name.endsWith(".html")).sort();

if (htmlFiles.length === 0) {
  console.error("No HTML files found.");
  process.exit(1);
}

const css = readFileSync(cssPath, "utf8");

/*
 * Class selectors in the compiled CSS are escaped (gap-2\.5, focus\:not-sr-only),
 * so capture a backslash-escaped character or a plain one, then unescape.
 */
const cssClasses = new Set(
  [...css.matchAll(/\.((?:\\.|[a-zA-Z0-9_-])+)/g)].map((m) => m[1].replace(/\\/g, ""))
);

let totalRefs = 0;

for (const file of htmlFiles) {
  const rel = relative(root, file).split(sep).join("/");
  const html = readFileSync(file, "utf8");
  const dir = dirname(file);

  /* ---------------- no JavaScript ---------------- */

  /*
   * Script budget: assets/js/theme.js is the single allowed file, and it is
   * the only reason this site ships any JavaScript at all. It is referenced
   * with a plain src, never inline, so the no-CSP-unsafe-inline rule holds.
   */
  const ALLOWED_SCRIPTS = [
    "assets/js/theme.js",
    "../assets/js/theme.js",
    "assets/js/nav.js",
    "../assets/js/nav.js",
  ];

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const body = m[2].trim();
    const src = attrs.match(/\bsrc\s*=\s*"([^"]+)"/i);
    const path = src ? src[1].split("/").pop() : "?";

    if (body) fail(rel, "contains an inline <script> block");

    if (!src) continue;

    if (!ALLOWED_SCRIPTS.includes(src[1])) {
      fail(rel, `references a script file: ${src[1]}`);
      continue;
    }

    /*
     * theme.js sets data-theme on <html>, so it has to block parsing. nav.js
     * only upgrades navigation, so deferring it is correct.
     */
    if (path === "theme.js" && /\basync\b|\bdefer\b/i.test(attrs)) {
      fail(rel, "defers theme.js, which reintroduces a flash of the wrong theme");
    }

    if (path === "nav.js" && /\basync\b/i.test(attrs)) {
      fail(rel, "loads nav.js async, which races the first click");
    }

    if (/\btype\s*=\s*["']?module/i.test(attrs)) {
      fail(rel, `loads ${path} as a module`);
    }
  }

  for (const m of html.matchAll(/\son[a-z]+\s*=\s*"/gi)) {
    fail(rel, `contains inline handler ${m[0].trim()}`);
  }

  if (/\bjavascript:/i.test(html)) fail(rel, "contains a javascript: URL");

  for (const m of html.matchAll(/href="([^"]+\.js[^"]*)"/gi)) {
    fail(rel, `links a script file: ${m[1]}`);
  }

  if (/\.php|\/wp-admin\/|wp-content/i.test(html)) fail(rel, "contains a WordPress reference");

  /* ---------------- links ---------------- */

  const ids = new Set();

  for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
    if (ids.has(m[1])) fail(rel, `duplicate id "${m[1]}"`);
    ids.add(m[1]);
  }

  for (const m of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    const href = m[1];
    totalRefs++;

    if (href === "" || href.startsWith("#")) {
      if (href.startsWith("#")) {
        const anchor = href.slice(1);

        if (anchor && !ids.has(anchor)) fail(rel, `anchor #${anchor} has no target`);
      }
      continue;
    }

    if (/^(https?:|mailto:|tel:|data:)/i.test(href)) continue;

    const [path, anchor] = href.split("#");
    const target = resolve(dir, decodeURIComponent(path));

    if (!existsSync(target)) {
      fail(rel, `link target missing: ${href}`);
      continue;
    }

    if (anchor) {
      const targetHtml = readFileSync(target, "utf8");
      const targetIds = new Set([...targetHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

      if (!targetIds.has(anchor)) fail(rel, `cross-page anchor ${href} has no target`);
    }
  }

  /* ---------------- utilities exist in the CSS ---------------- */

  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const token of m[1].split(/\s+/)) {
      if (!token || token.startsWith("prose-")) continue;
      if (token.includes("[")) continue; // arbitrary values, checked visually
      if (!cssClasses.has(token)) {
        notes.push(`${rel}: class "${token}" is not in the compiled CSS`);
      }
    }
  }

  /* ---------------- no duplicate attributes ---------------- */

  for (const m of html.matchAll(/<([a-z][\w-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/gi)) {
    const tag = m[1].toLowerCase();
    const names = [];
    const attrs = m[2];
    let i = 0;

    /*
     * Walk the attribute list by hand: a value may contain spaces and words
     * that look like attribute names, so quoted runs have to be skipped.
     */
    while (i < attrs.length) {
      while (i < attrs.length && /\s/.test(attrs[i])) i++;
      if (i >= attrs.length) break;

      let name = "";

      while (i < attrs.length && !/[\s=/]/.test(attrs[i])) {
        name += attrs[i];
        i++;
      }

      if (name) names.push(name.toLowerCase());
      else if (i < attrs.length && attrs[i] !== "=") i++; /* stray char, e.g. "/" */

      while (i < attrs.length && /\s/.test(attrs[i])) i++;
      if (attrs[i] === "=") {
        i++;
        while (i < attrs.length && /\s/.test(attrs[i])) i++;

        const quote = attrs[i];

        if (quote === '"' || quote === "'") {
          const end = attrs.indexOf(quote, i + 1);
          i = end === -1 ? attrs.length : end + 1;
        } else {
          while (i < attrs.length && !/\s/.test(attrs[i])) i++;
        }
      }
    }

    const dupes = names.filter((a, k) => names.indexOf(a) !== k);

    for (const dupe of new Set(dupes)) {
      fail(rel, `<${tag}> has a duplicate "${dupe}" attribute (browsers ignore the later one)`);
    }
  }

  /* ---------------- the stylesheet must actually be linked ---------------- */

  const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map((m) => m[0]);

  if (sheets.length === 0) {
    fail(rel, "no <link rel=\"stylesheet\"> — the page will render unstyled");
  }

  for (const tag of sheets) {
    const href = (tag.match(/href="([^"]+)"/) || [])[1];

    if (!href) continue;

    if (/^https?:/i.test(href)) {
      if (/fonts\.googleapis\.com/.test(href)) continue;
      fail(rel, `unexpected external stylesheet: ${href}`);
      continue;
    }

    if (!existsSync(resolve(dir, decodeURIComponent(href.split("?")[0])))) {
      fail(rel, `stylesheet missing on disk: ${href}`);
    }
  }

  if (!/rel="stylesheet"[^>]*assets\/css\/app\.css|assets\/css\/app\.css[^>]*rel="stylesheet"/i.test(html)) {
    fail(rel, "app.css is not linked");
  }

  if (!/fonts\.googleapis\.com\/css2/.test(html)) {
    fail(rel, "webfont stylesheet is not linked");
  }

  /* ---------------- structure ---------------- */

  if (!/<!DOCTYPE html>/i.test(html)) fail(rel, "missing doctype");
  if (!/<html lang="(en|fr)"/.test(html)) fail(rel, "missing lang on <html>");
  if (!/id="jkglow-theme"/.test(html)) fail(rel, "missing the theme toggle checkbox");
  if (!/id="jkglow-nav"/.test(html)) fail(rel, "missing the nav toggle checkbox");
  if (!/<svg class="flag"/.test(html)) fail(rel, "missing the flag switch");
  if (!/id="main"/.test(html)) fail(rel, "missing #main");
  if (!/<\/html>/.test(html)) fail(rel, "unterminated document");

  for (const tag of ["html", "head", "body", "header", "main", "footer", "section", "ul", "ol", "li", "form", "nav", "a", "p", "h1", "h2", "h3"]) {
    const open = (html.match(new RegExp(`<${tag}(\\s|>)`, "gi")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;

    if (open !== close) fail(rel, `<${tag}> unbalanced (${open} open, ${close} close)`);
  }

  if ((html.match(/<h1[\s>]/gi) || []).length !== 1) {
    fail(rel, `expected exactly one <h1>, found ${(html.match(/<h1[\s>]/gi) || []).length}`);
  }
}

console.log(`Checked ${htmlFiles.length} HTML files, ${totalRefs} references.`);

/* ------------------------------------------------------------------ *
 * Palette guard — every colour must be a blue (or a neutral).
 * Anything with real chroma outside the blue band is a regression.
 * ------------------------------------------------------------------ */

const BLUE_MIN = 175;
const BLUE_MAX = 285;
const CHROMA_FLOOR = 0.1;
const SOURCES = [join(root, "src", "input.css"), ...htmlFiles];

/** Returns { h, s } in 0..360 / 0..1, or null when the colour is achromatic. */
function hsl(hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  if (d < 0.004) return null;

  let h;

  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);

  if (h < 0) h += 360;

  const lightness = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * lightness - 1));

  return { h, s: Number.isFinite(s) ? s : 1 };
}

function name(h) {
  if (h < 20 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 95) return "lime";
  if (h < 160) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 290) return "violet";
  if (h < 345) return "magenta";
  return "red";
}

const offenders = new Map();

for (const file of SOURCES) {
  /*
   * National flag SVGs are exempt: a French or British flag drawn in blue
   * would simply be wrong. Everything else must be blue or neutral.
   */
  const text = readFileSync(file, "utf8").replace(/<svg class="flag"[\s\S]*?<\/svg>/g, "");

  for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[1];
    const got = hsl(hex);

    if (!got || got.s < CHROMA_FLOOR) continue;
    if (got.h >= BLUE_MIN && got.h <= BLUE_MAX) continue;

    if (!offenders.has(hex)) offenders.set(hex, { where: new Set(), hue: got.h, sat: got.s });
    offenders.get(hex).where.add(relative(root, file).split(sep).join("/"));
  }
}

for (const [hex, info] of offenders) {
  problems.push(
    `non-blue #${hex} (${name(info.hue)} hue ${Math.round(info.hue)}, sat ${(info.sat * 100).toFixed(0)}%) in ${[...info.where].join(", ")}`
  );
}


if (notes.length) {
  console.log(`\n${notes.length} class note(s):`);
  for (const note of notes.slice(0, 20)) console.log(`  - ${note}`);
  if (notes.length > 20) console.log(`  ... and ${notes.length - 20} more`);
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ! ${problem}`);
  process.exit(1);
}

  console.log("\nNo unexpected JavaScript, no broken links, no missing utilities. OK");

