/**
 * One-off repair: re-attach the compiled stylesheet and the webfont link to
 * every static page.
 *
 * The markup was originally rendered by the WordPress theme, which injected
 * both through wp_enqueue_style()/wp_enqueue_script(). Deleting the PHP left
 * the pages with no <link rel="stylesheet"> at all, so the site rendered
 * unstyled. This writes the tags back in, with FR pages using ../ paths.
 *
 * Run: node scripts/link-stylesheet.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const FONTS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '<link',
  '  rel="stylesheet"',
  '  href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&display=swap"',
  '/>',
].join("\n");

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git", ".idea", "src", "scripts", "assets"].includes(entry)) continue;

    const full = join(dir, entry);

    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }

  return found;
}

let touched = 0;

for (const file of walk(root).sort()) {
  const rel = relative(root, file).split(sep).join("/");
  const depth = rel.includes("/") ? "../" : "";
  const css = depth + "assets/css/app.css";
  const html = readFileSync(file, "utf8");

  if (html.includes('href="' + css + '"')) {
    console.log(`  ok  ${rel}`);
    continue;
  }

  /* Keep the stylesheet first so it wins over any later author styles. */
  const head = `<link rel="stylesheet" href="${css}" />\n${FONTS}\n\t`;

  /*
   * Insert straight after <head>, leaving </head> alone. Matching on the
   * open tag alone avoids clobbering the closing tag.
   */
  const next = html.replace(/<head>/, `<head>\n\t${head}`);

  if (next === html) {
    console.log(`  !!  ${rel}: no <head> anchor, skipped`);
    continue;
  }

  if (!/<\/head>/.test(next)) {
    console.log(`  !!  ${rel}: </head> missing, skipped`);
    continue;
  }

  writeFileSync(file, next, "utf8");
  console.log(`  ->  ${rel}  (+${css})`);
  touched++;
}

console.log(`\n${touched} page(s) updated.`);
