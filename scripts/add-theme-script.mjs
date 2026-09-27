/**
 * Injects the runtime scripts into the <head> of every page.
 *
 * Order matters and is preserved: theme.js must run first and block parsing so
 * <html data-theme> exists before the first paint; nav.js enhances navigation
 * and may be deferred.
 *
 * The tags reuse the same relative prefix as the stylesheet link that already
 * exists on the page (none at the root, ../ under fr/).
 *
 * Idempotent — a page that already carries a tag is left alone.
 *
 * Run: node scripts/add-theme-script.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP = ["node_modules", ".git", ".idea", "src", "scripts", "assets"];

/* Matches the stylesheet href already in the page, to reuse its prefix. */
const STYLESHEET = /<link rel="stylesheet" href="([^"]*assets\/css\/app\.css)"/;

/* Blocking, then deferred: the first must paint, the second may wait. */
const SCRIPTS = [
  { file: "assets/js/theme.js", defer: false },
  { file: "assets/js/nav.js", defer: true },
];

let touched = 0;

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.includes(entry)) continue;

    const full = join(dir, entry);

    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }

  return found;
}

for (const file of walk(root)) {
  const original = readFileSync(file, "utf8");

  /* Check each script on its own: a page can be missing only one of the two. */
  const missing = SCRIPTS.filter((s) => !original.includes(s.file));

  if (!missing.length) continue;

  const match = original.match(STYLESHEET);

  if (!match) {
    console.log(`  !!  no stylesheet in ${relative(root, file)} — skipped`);
    continue;
  }

  /* "assets/css/app.css" -> "assets/js/…"; "../assets/…" -> "../assets/js/…". */
  const prefix = match[1].slice(0, match[1].indexOf("assets/"));

  const tags = missing.map(
    (s) => `<script src="${prefix}${s.file}"${s.defer ? " defer" : ""}></script>`
  );

  /* Before the stylesheet: data-theme must exist before the first paint. */
  const html = original.replace(match[0], `${tags.join("\n\t\t")}\n\t\t${match[0]}`);

  if (html === original) continue;

  writeFileSync(file, html, "utf8");
  touched++;
  console.log(`  ->  ${relative(root, file).split(sep).join("/")}  ${tags.length} tag(s)`);
}

console.log(`\n${touched} page(s) updated.`);
