/**
 * Applies the motion library to the markup.
 *
 * The animation classes in src/input.css are inert until an element carries
 * them, so this pass wires the useful ones onto real elements: a scroll-driven
 * progress ring, scroll-driven counters, varied card entrances, hover lifts
 * and a drawn rule under each section heading.
 *
 * Every rule is idempotent — re-running changes nothing.
 *
 * Run: node scripts/apply-motion.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Circumference of the progress ring: 2 * PI * 19. */
const DASH = (2 * Math.PI * 19).toFixed(1);

const SKIP = ["node_modules", ".git", ".idea", "src", "scripts", "assets"];

const progressRing = `<div class="pointer-events-none fixed bottom-5 right-5 z-50 hidden sm:block" aria-hidden="true">
	<svg viewBox="0 0 44 44" class="h-11 w-11 -rotate-90">
		<circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" stroke-width="2" class="text-fg-subtle opacity-25" />
		<circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="progress-ring text-accent" style="--dash:${DASH}" />
	</svg>
</div>`;

const headingRule =
  '\n\t\t<span class="scrub-track mt-5 block h-px w-24 bg-gradient-to-r from-accent to-transparent" style="--i:3" aria-hidden="true"></span>';

/* Each gallery card gets a different entrance so the grid does not march. */
const GALLERY_REVEALS = ["reveal-mask", "reveal-flip", "reveal-stretch"];

/**
 * Adds `stagger-children` to a grid or stack whose children already carry
 * inline `--i` offsets.
 *
 * The class only supplies the per-child `animation-range`, so the inline
 * stagger keeps driving the offsets and children without one fall back to the
 * `:nth-child()` ladder in src/input.css.
 */
function addStaggerGroups(html) {
  return html.replace(
    /<(ul|ol|div)\b[^>]*class="[^"]*\b(?:grid|space-y-)[^"]*"[^>]*>/g,
    (m, _tag, offset) => {
      if (/\bstagger-children\b/.test(m)) return m;

      /* Only look inside this element, stopping at the end of its section. */
      const rest = html.slice(offset + m.length);
      const end = rest.search(/<\/section>/);
      const scope = end === -1 ? rest : rest.slice(0, end);

      if ((scope.match(/style="--i:/g) || []).length < 2) return m;

      return m.replace(/class="([^"]*)"/, (mm, cls) => `class="${cls} stagger-children"`);
    }
  );
}

/** Swaps a reveal for a clip-path entrance or a scroll-scrubbed one. */
function addClipReveals(html) {
  return html
    .replace(/class="eyebrow reveal-up /g, 'class="eyebrow scrub-tighten ')
    .replace(/class="measure reveal-up /g, 'class="measure reveal-clip-up ');
}

/**
 * Per-frame treatment: the hero frame opens with an iris, a frame holding a
 * video opens with a curtain, the spinning frame gets the same, and frames
 * alternate between two depths so a screen with three of them does not read as
 * one flat plane.
 */
function decorateFrames(html) {
  const re = /<div\b[^>]*class="[^"]*\bmedia-frame\b[^"]*"[^>]*>/g;
  const matches = [...html.matchAll(re)];

  if (!matches.length) return html;

  const edits = [];

  matches.forEach((m, n) => {
    const start = m.index + m[0].length;
    const stop = n + 1 < matches.length ? matches[n + 1].index : html.length;
    const body = html.slice(start, stop);

    const wanted = [];

    if (n === 0) wanted.push("reveal-iris");
    if (/<video\b/.test(body)) wanted.push("reveal-curtain");
    if (/\bborder-spin\b/.test(m[0])) wanted.push("reveal-curtain");

    wanted.push(n % 2 === 0 ? "depth-shallow" : "depth-deep");

    const fresh = wanted.filter((c) => !new RegExp(`\\b${c}\\b`).test(m[0]));

    if (!fresh.length) return;

    edits.push({
      index: m.index,
      original: m[0],
      next: m[0].replace(/class="([^"]*)"/, (mm, cls) => `class="${cls} ${fresh.join(" ")}"`),
    });
  });

  return splice(html, edits);
}

/** Full-bleed background media sits in a `parallax-host`, not a media frame. */
function markParallaxHosts(html) {
  return html.replace(
    /<div\b[^>]*class="([^"]*\babsolute\b[^"]*\binset-0\b[^"]*)"([^>]*aria-hidden="true"[^>]*)>/g,
    (m, cls, rest) =>
      /\bparallax-host\b/.test(cls)
        ? m
        : `<div class="${cls} parallax-host"${rest}>`
  );
}

/**
 * Entrances that suit a particular element: figures pop, the process list
 * alternates sides, and two-column blocks are scrubbed into place.
 *
 * The alternation uses a counter rather than a character offset, so it stays
 * stable when earlier edits change the length of the document.
 */
function addTargetedReveals(html) {
  let pop = 0;
  let slide = 0;

  return html
    .replace(/<div class="reveal-up"( style="--i:\d+")?>/g, (m, style) => {
      const cls = pop++ % 2 === 0 ? "reveal-pop" : "reveal-slide-in";

      return `<div class="${cls}"${style || ""}>`;
    })
    .replace(/<li class="reveal-up flex gap-4"/g, () => {
      const cls = slide++ % 2 === 0 ? "reveal-slide-in" : "reveal-slide-in-rtl";

      return `<li class="${cls} flex gap-4"`;
    })
    /* Second pass: alternate the sides of a list that already slid in. */
    .replace(/<li class="reveal-slide-in flex gap-4"( style="--i:(\d+)")?>/g, (m, style, i) =>
      Number(i) % 2 === 1
        ? `<li class="reveal-slide-in-rtl flex gap-4"${style || ""}>`
        : m
    )
    .replace(/class="(grid gap-4 sm:grid-cols-2 lg:order-1)"/g, 'class="$1 scrub-lift"');
}

function splice(html, edits) {
  let out = "";
  let cursor = 0;

  for (const edit of [...edits].sort((a, b) => a.index - b.index)) {
    out += html.slice(cursor, edit.index) + edit.next;
    cursor = edit.index + edit.original.length;
  }

  return out + html.slice(cursor);
}

/**
 * Adds a scroll-scrubbed rule as a sibling *after* each section heading, never
 * inside it.
 *
 * Two details make this idempotent: the tempered dot stops `</h2>` from
 * matching across a later closing tag, and the negative lookahead rejects a
 * heading that already has a rule following it.
 */
function addHeadingRules(html) {
  return html.replace(
    /(<h2 class="reveal-up[^"]*font-semibold"[^>]*>(?:(?!<\/h2>)[\s\S])*<\/h2>)(?!\s*<span class="(?:rule-draw|scrub-track)\b)/g,
    `$1${headingRule}`
  );
}

function varyGallery(html) {
  let i = 0;

  return html.replace(
    /class="card reveal-scale tilt glow-hover overflow-hidden"/g,
    () => `class="card ${GALLERY_REVEALS[i++ % GALLERY_REVEALS.length]} tilt glow-hover hover-lift-lg overflow-hidden"`
  );
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

  let html = original;

  if (!html.includes("progress-ring")) {
    html = html.replace(/<body\b[^>]*>/, (m) => `${m}\n${progressRing}`);
  }

  html = html
    .replace(/class="counter"/g, 'class="count-scroll"')
    .replace(
      /class="text-gradient text-gradient-animated"/g,
      'class="text-gradient text-gradient-animated gradient-text-shift"'
    )
    .replace(
      /class="mt-7 font-display text-display-1 font-semibold"/g,
      'class="enter-mask mt-7 font-display text-display-1 font-semibold"'
    )
    .replace(/class="pulse-dot"/g, 'class="pulse-dot glow-breathe"')
    .replace(/class="card card-hover (?!hover-lift)/g, 'class="card card-hover hover-lift ')
    .replace(/class="media-frame (?!sweep-overlay)/g, 'class="media-frame sweep-overlay ')
    .replace(
      /class="btn btn-primary btn-lg"(\s*>)/g,
      'class="btn btn-primary btn-lg arrow-shift"$1'
    );

  html = addHeadingRules(html);
  html = varyGallery(html);

  /* Staggered groups, clip-path entrances, per-frame parallax depth. */
  html = addStaggerGroups(html);
  html = addClipReveals(html);
  html = decorateFrames(html);
  html = markParallaxHosts(html);
  html = addTargetedReveals(html);

  if (html === original) continue;

  writeFileSync(file, html, "utf8");
  touched++;
  console.log(`  ->  ${relative(root, file).split(sep).join("/")}`);
}

console.log(`\n${touched} page(s) updated.`);
