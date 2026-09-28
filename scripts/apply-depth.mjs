/**
 * The immersion layer: depth, perspective and 3D, wired into the pages that
 * carry the brand story (home, about, contact) in both languages.
 *
 * The CSS lives in src/input.css under "Immersion — depth, perspective, 3D";
 * this script only adds the hooks it needs. Every rule is idempotent, and it
 * runs last: the motion layer hands out hover-lift, and the depth layer turns
 * that into a plane.
 *
 * Run: node scripts/apply-depth.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, basename, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP = ["node_modules", ".git", ".idea", "src", "scripts", "assets"];

/*
 * The long-form legal and utility pages stay sober on purpose. The brand page
 * is a selling page like the home page, so it gets the same treatment: it
 * carries the depth, the hero scene and the stepped section edges, and a
 * product page is exactly where a visitor expects that to be present.
 *
 * Matched on basename, so the French page of each pair is picked up too.
 */
const PAGES = new Set([
  "index.html",
  "about.html",
  "a-propos.html",
  "contact.html",
  "skin1004.html",
]);

/* The floor, the sun it rises from, and the core turning in front of it. */
const HERO_STAGE = [
  '<div class="depth-stage" aria-hidden="true">',
  ...indent(starfield(14, 1), "\t\t"),
  '\t\t<span class="depth-floor"></span>',
  '\t\t<span class="depth-sun"></span>',
  '\t\t<span class="depth-horizon"></span>',
  '\t\t<span class="depth-beam">',
  "\t\t\t<i></i>",
  "\t\t\t<i></i>",
  "\t\t</span>",
  '\t\t<span class="gyro">',
  '\t\t\t<span class="gyro-ring gyro-ring-a"><i class="gyro-bead"></i></span>',
  '\t\t\t<span class="gyro-ring gyro-ring-b"><i class="gyro-bead"></i></span>',
  '\t\t\t<span class="gyro-ring gyro-ring-c"></span>',
  '\t\t\t<span class="gyro-core"></span>',
  "\t\t</span>",
  "\t</div>",
].join("\n");

/* A room around the whole document, so the sections read as volumes. */
const PAGE_DEPTH = [
  '<div class="page-depth" aria-hidden="true">',
  '\t<span class="depth-wash depth-wash-a"></span>',
  '\t<span class="depth-wash depth-wash-b"></span>',
  '\t<span class="depth-rays"><i></i></span>',
  '\t<span class="bokeh bokeh-a"></span>',
  '\t<span class="bokeh bokeh-b"></span>',
  '\t<span class="bokeh bokeh-c"></span>',
  "</div>",
].join("\n");

const FOLD_EDGE = '<span class="fold-edge" aria-hidden="true"></span>';

const CREAM_FIELD = [
  '<span class="cream-blob cream-a"></span>',
  '<span class="cream-blob cream-b"></span>',
].join("\n");

/**
 * A sky of small lights. Each star carries its own peak, its own rhythm and
 * its own place on the plane, so the field never pulses as one surface.
 * Positions step through a coprime stride, which spreads them without a
 * random number generator the build would have to reproduce.
 */
function starfield(count, seed) {
  const stars = [];

  for (let i = 0; i < count; i++) {
    const big = i % 5 === 2;
    const rhythm = (4.6 + ((i * 7 + seed) % 40) / 10).toFixed(1);
    const place = [
      "left:" + ((i * 37 + seed * 13) % 94 + 3) + "%",
      "top:" + ((i * 61 + seed * 7) % 86 + 7) + "%",
      "--i:" + i,
      "--peak:" + (0.55 + ((i * 17 + seed) % 45) / 100).toFixed(2),
      "--twinkle-duration:" + rhythm + "s",
    ];

    stars.push("<i" + (big ? ' class="big"' : "") + ' style="' + place.join(";") + '"></i>');
  }

  return ['<div class="starfield" aria-hidden="true">', ...stars.map((star) => "\t" + star), "</div>"].join("\n");
}

/** Prefixes every line of a block, so injected markup keeps the file's shape. */
function indent(block, tabs) {
  return block.split("\n").map((line) => (line ? tabs + line : line));
}

/** Index of the <div> containing the given offset, or -1. */
function enclosingDiv(html, index) {
  const tag = /<\/?div\b[^>]*>/g;
  const stack = [];
  let match;

  while ((match = tag.exec(html)) !== null && match.index < index) {
    if (match[0][1] === "/") stack.pop();
    else stack.push(match.index);
  }

  return stack.length ? stack[stack.length - 1] : -1;
}

/** The opening tag that starts at `index`, or an empty string. */
function openTagAt(html, index) {
  if (index < 0) return "";

  const end = html.indexOf(">", index);

  return end === -1 ? "" : html.slice(index, end + 1);
}

/** Adds classes to the opening tag that starts at `index`. */
function addClassesAt(html, index, classNames) {
  const open = openTagAt(html, index);

  if (!open) return html;

  const fresh = classNames.filter((name) => !new RegExp("\\b" + name + "\\b").test(open));

  if (!fresh.length) return html;

  const patched = open.replace('class="', 'class="' + fresh.join(" ") + " ");

  return html.slice(0, index) + patched + html.slice(index + open.length);
}

/**
 * What a section actually shows: its text and its images. Two sections that
 * read the same and point at the same media are the same block, whatever
 * their utility classes are.
 */
function signature(block) {
  const text = block
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const media = [...block.matchAll(/alt="([^"]*)"/g)].map((match) => match[1]).join(" | ");

  return media + "::" + text;
}

/**
 * A page assembled by hand can end up with the same block twice. Identical
 * blocks carry no extra information, so only the first copy is kept.
 */
function dedupeSections(html) {
  const seen = new Set();
  let dropped = 0;

  const out = html.replace(/<section\b[\s\S]*?<\/section>/g, (block) => {
    /* Short blocks can legitimately repeat: skip links, landmarks. */
    if (block.length < 400) return block;

    const key = signature(block);

    if (seen.has(key)) {
      dropped++;
      return "";
    }

    seen.add(key);
    return block;
  });

  return { html: out.replace(/\n{3,}/g, "\n\n"), dropped };
}

/** The fixed backdrop that gives every section a room to sit in. */
function pageBackdrop(html) {
  if (html.includes('class="page-depth"')) return html;

  return html.replace(/(<body\b[^>]*>)/, (m) => m + "\n" + PAGE_DEPTH);
}

/** The room the hero stands in. */
function heroScene(html) {
  if (html.includes('class="depth-stage"')) return html;

  return html.replace(/<section class="relative ((?:isolate )?)([^"]*bg-bg-subtle[^"]*)">/, (m, isolation, rest) => {
    const wrap = isolation.trim() ? isolation : "isolate ";

    return '<section class="relative ' + (wrap + rest).trim() + '">' + "\n\t" + HERO_STAGE;
  });
}

/** Two creams left on the hero glass, behind everything the page says. */
function creamField(html) {
  if (html.includes("cream-blob")) return html;

  return html.replace(/(<div class="depth-stage"[^>]*>)/, (m) => m + "\n\t\t" + CREAM_FIELD);
}

/** The softbox that comes up over a product shot on hover. */
function studioLights(html) {
  if (html.includes("studio-light")) return html;

  return html.replace(
    /(<div class="media-frame\b[^>]*>)([\s\S]*?)(<\/div>)/g,
    (m, open, inner, close) => {
      if (!/<img\b/.test(inner)) return m;

      const light = '\n\t\t\t\t\t<span class="studio-light" aria-hidden="true"></span>\n\t\t\t\t';

      return open + inner.replace(/(\s*)$/, "") + light + close;
    }
  );
}

/** A swatch under the channel label, like a colour bar drawn by hand. */
function swatchRule(html) {
  if (html.includes('class="swatch')) return html;

  /* The centred label that introduces the belt, in either language. */
  const label = /(<p class="[^"]*text-center[^"]*text-fg-subtle[^"]*">[^<]*<\/p>)(?!\s*<span class="swatch)/;

  return html.replace(label, (m) => m + '\n\t\t<span class="swatch mt-4" aria-hidden="true"></span>');
}

/** A lit edge where a dark panel folds back into the page. */
function foldEdges(html) {
  const panel = /<div\b[^>]*class="[^"]*bg-(?:ink-950|ink-900)[^"]*"[^>]*>/g;

  /* The edge hangs on a negative z-index, so its surface needs a context. */
  const isolated = html.replace(panel, (m, cls) =>
    /\bisolate\b/.test(cls) ? m : m.replace('class="' + cls + '"', 'class="' + cls + ' isolate"')
  );

  return isolated.replace(
    /(<div\b[^>]*class="[^"]*bg-(?:ink-950|ink-900)[^"]*"[^>]*>)(?!\s*<span class="fold-edge)/g,
    (m) => m + "\n\t" + FOLD_EDGE
  );
}

/**
 * A full-bleed dark room: the lit edge that folds it back, and a sky behind
 * it. Both go in together and in a fixed order, so a second pass recognises
 * the first one and leaves the section alone.
 */
function darkRooms(html) {
  return html.replace(
    /(<section\b[^>]*class="[^"]*bg-(?:ink-950|ink-900)[^"]*"[^>]*>)(?!\s*<(?:span class="fold-edge|div class="starfield))/g,
    (m) => m + "\n\t" + FOLD_EDGE + "\n\t" + indent(starfield(10, 5), "\t").join("\n")
  );
}

/**
 * A sheen crosses a button when the pointer arrives. Buttons only: a shine
 * that answers every card and every chip turns the whole page into a
 * Christmas tree, and the cards already have their own depth and sweep.
 */
function glintedSurfaces(html) {
  const withGlint = html.replace(/class="([^"]*)"/g, (m, cls) => {
    const tokens = cls.split(/\s+/).filter(Boolean);

    if (!tokens.includes("glint")) return m;

    if (tokens[0] === "btn") return m;

    const kept = tokens.filter((t) => t !== "glint");

    return 'class="' + kept.join(" ") + '"';
  });

  return withGlint.replace(/class="([^"]*)"/g, (m, cls) => {
    const tokens = cls.split(/\s+/).filter(Boolean);

    if (tokens.includes("glint") || tokens[0] !== "btn") return m;

    return 'class="' + tokens.join(" ") + ' glint"';
  });
}

/**
 * The headline sits on its own plane and every line rises out of its own
 * mask, which takes over from the shared clip animation.
 */
function heroTitle(html) {
  if (html.includes("title-stage")) return html;

  const h1 = /<h1\b([^>]*)>([\s\S]*?)<\/h1>/.exec(html);

  if (!h1) return html;

  const className = /class="([^"]*)"/.exec(h1[1]);

  if (!className) return html;

  const cls = className[1].replace(/\btext-mask\b|\benter-mask\b/g, " ").replace(/\s+/g, " ").trim() + " text-3d";
  const lines = h1[2]
    .split(/<br\b[^>]*>/i)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return html;

  const masked = lines
    .map(
      (line, i) =>
        '<span class="line-mask"><span class="line-rise" style="--i:' + i + '">' + line + "</span></span>"
    )
    .join("\n\t\t\t\t\t");

  const block = '<div class="title-stage">\n\t\t\t\t\t<h1 class="' + cls + '">' + masked + "</h1>\n\t\t\t\t</div>";
  const parent = enclosingDiv(html, h1.index);
  const rebuilt = html.slice(0, h1.index) + block + html.slice(h1.index + h1[0].length);

  return addClassesAt(rebuilt, parent, ["perspective-3d"]);
}

/**
 * The product grid becomes a deck seen from above: the cards start folded
 * flat and fan open as the section arrives.
 */
function deckCards(html) {
  let folded = 0;

  const out = html.replace(/<article class="([^"]*)"([^>]*)>/g, (m, cls, rest) => {
    if (!/\btilt\b/.test(cls) || !/\bhover-lift-lg\b/.test(cls)) return m;

    /* The fan is the reveal now, so the entrance clip steps aside. */
    const keep = cls
      .split(/\s+/)
      .filter(
        (token) => token && token !== "card" && token !== "tilt" && token !== "hover-lift-lg" && token !== "overflow-hidden" && !/^reveal-/.test(token)
      );

    folded++;

    return '<article class="card deck-item ' + keep.join(" ") + '"' + rest + ">";
  });

  /* Every grid holding a card becomes a deck, back to front. */
  const parents = new Set();

  for (let at = out.indexOf("deck-item"); at !== -1; at = out.indexOf("deck-item", at + 1)) {
    parents.add(enclosingDiv(out, at));
  }

  let patched = out;

  for (const parent of [...parents].sort((a, b) => b - a)) patched = addClassesAt(patched, parent, ["deck"]);

  return { html: patched, folded };
}

/** Every other card gets a plane of its own, with its content above it. */
function liftedSurfaces(html) {
  return html.replace(/\bhover-lift-lg\b/g, "lift-3d").replace(/\bhover-lift\b/g, "lift-3d");
}

/** Section intros settle into place layer by layer as they come into view. */
function stackedIntros(html) {
  const intro = /<(?:section|div|li)\b[^>]*class="([^"]*\b(?:scroll-fade|scroll-fade-late|reveal-left|reveal-right)\b[^"]*)"[^>]*>/g;

  return html.replace(intro, (m, cls, offset) => {
    /* Cards are planes of their own; stacking them twice reads as noise. */
    if (/\bcard\b/.test(cls) || /\bstack-3d\b/.test(cls)) return m;

    const rest = html.slice(offset + m.length);
    const limit = rest.indexOf("</section>");
    const scope = limit === -1 ? rest.slice(0, 2000) : rest.slice(0, limit);

    if (!/<h2\b/.test(scope)) return m;

    return m.replace('class="', 'class="stack-3d ');
  });
}

/** The channel marquee becomes a belt running around the page. */
function belt(html) {
  const track = /<div\b[^>]*class="[^"]*\banimate-marquee\b[^"]*"[^>]*>/.exec(html);

  if (!track) return html;

  /* Close the tags an earlier pass left hanging, then name the wrapper. */
  const tidied = html.replace(/class="([^"]*)"\s+>/g, 'class="$1">');

  return addClassesAt(tidied, enclosingDiv(tidied, tidied.indexOf(track[0])), ["belt"]);
}

/**
 * A process list becomes scannable: one slide direction for every step, a
 * spine class on the list, and a real badge instead of a stack of utilities
 * that no component rule can override.
 */
function numberedSteps(html) {
  return html.replace(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/g, (m, attrs, inner) => {
    if (!inner.includes("bar-grow")) return m;

    /* The component owns its own rhythm and its own type, so the utilities
     * that would outrank it are dropped instead of being fought with
     * !important. */
    const list = attrs.replace(/class="([^"]*)"/, (c, cls) => {
      const tokens = cls.split(/\s+/).filter(Boolean).filter((t) => t !== "space-y-5");

      if (!tokens.includes("steps")) tokens.push("steps");

      return 'class="' + tokens.join(" ") + '"';
    });

    const body = inner
      .replace(/\breveal-slide-in-rtl\b/g, "reveal-slide-in")
      .replace(
        /(<span class=")bar-grow grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white dark:bg-white dark:text-ink-900"/g,
        '$1bar-grow badge"'
      )
      .replace(/<h3 class="font-semibold">/g, "<h3>")
      .replace(/<p class="mt-1\.5 text-sm leading-relaxed text-fg-muted">/g, "<p>");

    return "<ol" + list + ">" + body + "</ol>";
  });
}

/**
 * The figures are facts, so they live in the markup as text and the light
 * travels across them. Counting the digits up under the reader was the one
 * animation that made a number look like it was still being decided.
 */
function staticFigures(html) {
  return html.replace(
    /<span class="count-scroll" style="--target:(\d+)"><\/span>/g,
    (m, digits) => '<span class="num-ink">' + digits + "</span>"
  );
}

/** Buttons press into the page instead of sliding over it. */
function pressedButtons(html) {
  return html.replace(/class="btn (?!btn-3d)/g, 'class="btn btn-3d ');
}

/** A slow pull through focus on the editorial images, never the grid. */
function focusPull(html) {
  const parts = html.split(/(<article\b[\s\S]*?<\/article>)/);

  return parts
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/class="(media-frame[^"]*)"/g, (m, cls) => (/\bdof-far\b/.test(cls) ? m : 'class="' + cls + ' dof-far"'))
    )
    .join("");
}

/** Counters get an embossed face and a plane to hover over. */
function embossedStats(html) {
  const starts = [...html.matchAll(/<span class="count-scroll/g)].map((match) => html.lastIndexOf("<dd", match.index));

  if (!starts.length) return { html, embossed: 0 };

  /* Back to front, so the earlier offsets stay valid. */
  for (const start of starts.sort((a, b) => b - a)) {
    if (start === -1) continue;

    /* The wrapper is measured on the patched text: the first patch shifts it. */
    const patched = addClassesAt(html, start, ["num-3d", "tile-3d"]);
    const at = patched.indexOf("num-3d", start);

    html = addClassesAt(patched, enclosingDiv(patched, at), ["perspective-3d"]);
  }

  return { html, embossed: starts.length };
}

/**
 * This script only adds hooks and rewrites class attributes, so the number of
 * landmarks, headings and links may shrink (duplicates are dropped) but never
 * grow. A replacement that doubles the document is a bug, not a rewrite.
 */
function guard(original, html, name) {
  const landmarks = ["<main", "<section", "<article", "<h1", "<h2", "<a ", "<form", "<img"];

  for (const tag of landmarks) {
    const before = original.split(tag).length;
    const after = html.split(tag).length;

    if (after > before) {
      throw new Error(name + ": the transform added " + (after - before) + " extra " + tag + " tag(s). Nothing was written.");
    }
  }
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.includes(entry)) continue;

    const full = join(dir, entry);

    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry.endsWith(".html") && PAGES.has(basename(entry))) found.push(full);
  }

  return found;
}

let touched = 0;
let totalDropped = 0;
let totalDecked = 0;
let totalEmbossed = 0;

for (const file of walk(root)) {
  const name = basename(file);
  const original = readFileSync(file, "utf8");

  const { html: deduped, dropped } = dedupeSections(original);

  let html = pageBackdrop(deduped);
  html = heroScene(html);
  html = foldEdges(html);
  html = darkRooms(html);
  html = heroTitle(html);

  const deck = deckCards(html);
  html = deck.html;

  html = liftedSurfaces(html);
  html = stackedIntros(html);
  html = numberedSteps(html);
  html = staticFigures(html);
  html = belt(html);
  html = swatchRule(html);
  html = creamField(html);
  html = studioLights(html);
  html = pressedButtons(html);
  html = glintedSurfaces(html);
  html = focusPull(html);

  const stats = embossedStats(html);
  html = stats.html;

  if (html === original) {
    console.log("  ==  unchanged: " + relative(root, file).split(sep).join("/"));
    continue;
  }

  guard(original, html, name);

  writeFileSync(file, html, "utf8");
  touched++;

  totalDropped += dropped;
  totalDecked += deck.folded;
  totalEmbossed += stats.embossed;

  console.log(
    "  ->  " +
      relative(root, file).split(sep).join("/") +
      (dropped ? "  · " + dropped + " duplicate section(s) removed" : "") +
      (deck.folded ? "  · " + deck.folded + " card(s) fanned" : "") +
      (stats.embossed ? "  · " + stats.embossed + " counter(s) embossed" : "")
  );
}

console.log(
  "\n" +
    touched +
    " page(s) updated · " +
    totalDecked +
    " cards fanned · " +
    totalEmbossed +
    " counters embossed · " +
    totalDropped +
    " duplicate sections removed"
);
