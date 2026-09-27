/**
 * Generates the site's raster imagery and the looping brand film.
 *
 * Everything is drawn from scratch (SVG -> sharp -> PNG, SVG frames -> ffmpeg
 * -> MP4) so the brand imagery is original, on-palette and reproducible. No
 * stock photos, no external services.
 *
 * Palette is strictly blue: ink #102A43 / #071A2F, azure #3459A6 / #6793D2.
 * Nothing green: the Centella accent was re-pitched warm.
 *
 * Run: node scripts/generate-media.mjs
 */

import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ffmpeg from "ffmpeg-static";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const imgDir = join(root, "assets", "img");
const vidDir = join(root, "assets", "video");
const tmpDir = join(root, "assets", ".frames");

const NAVY = "#102A43";
const NAVY_DEEP = "#071A2F";
const NAVY_MID = "#243B53";
const AZURE = "#3459A6";
const AZURE_LIGHT = "#6793D2";
const AZURE_PALE = "#C2D6EE";
const AZURE_WASH = "#C2D6EE";
const AZURE_DEEP = "#6793D2";
const MIST = "#C2D6EE";

mkdirSync(imgDir, { recursive: true });
mkdirSync(vidDir, { recursive: true });

const rnd = (seed) => {
  /* Deterministic pseudo-random so rebuilds are byte-identical. */
  let s = seed;

  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

/* ------------------------------------------------------------------ *
 * Shared drawing helpers
 * ------------------------------------------------------------------ */

const defs = `
  <defs>
    <linearGradient id="navyWash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY_MID}"/>
      <stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
    <linearGradient id="azureWash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${AZURE_LIGHT}"/>
      <stop offset="1" stop-color="${AZURE}"/>
    </linearGradient>
    <linearGradient id="paleWash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#DDE9F6"/>
      <stop offset="1" stop-color="${AZURE_DEEP}"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${AZURE_LIGHT}" stop-opacity=".55"/>
      <stop offset="1" stop-color="${AZURE_LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${MIST}" stop-opacity=".45"/>
      <stop offset="1" stop-color="${MIST}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowC" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${AZURE_DEEP}" stop-opacity=".5"/>
      <stop offset="1" stop-color="${AZURE_DEEP}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

/** Wrap inner markup in a complete SVG with the shared gradient defs. */
function frame(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${defs}
${inner}
  </svg>`;
}

/** An abstract soft-light backdrop used behind the product silhouettes. */
function backdrop(w, h, seed, palette, extra = "") {
  const r = rnd(seed);
  const blobs = [];

  for (let i = 0; i < 7; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const rad = (0.18 + r() * 0.34) * Math.min(w, h);
    const fill = palette[i % palette.length];

    blobs.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="${fill}"/>`);
  }

  return frame(
    w,
    h,
    `    <rect width="${w}" height="${h}" fill="url(#navyWash)"/>
    ${blobs.join("\n    ")}
    <rect width="${w}" height="${h}" fill="url(#navyWash)" opacity=".35"/>
${extra}`
  );
}

/** A dropper serum bottle. */
function serumBottle(x, y, s, glass, cap) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="46" y="0" width="44" height="18" rx="6" fill="${cap}"/>
    <rect x="52" y="16" width="32" height="26" rx="5" fill="${cap}" opacity=".9"/>
    <path d="M34 44h68a10 10 0 0 1 10 10v128a14 14 0 0 1-14 14H38a14 14 0 0 1-14-14V54a10 10 0 0 1 10-10Z" fill="${glass}"/>
    <rect x="38" y="66" width="60" height="46" rx="6" fill="#ffffff" opacity=".82"/>
    <rect x="46" y="76" width="34" height="4" rx="2" fill="${NAVY}" opacity=".55"/>
    <rect x="46" y="86" width="22" height="4" rx="2" fill="${AZURE}" opacity=".85"/>
    <rect x="46" y="98" width="30" height="3" rx="1.5" fill="${NAVY}" opacity=".3"/>
    <rect x="34" y="54" width="12" height="120" rx="6" fill="#ffffff" opacity=".2"/>
  </g>`;
}

/** A cosmetic jar. */
function creamJar(x, y, s, glass, cap) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M22 8h76a10 10 0 0 1 10 10v14H12V18A10 10 0 0 1 22 8Z" fill="${cap}"/>
    <rect x="12" y="32" width="96" height="9" rx="4" fill="${NAVY_DEEP}" opacity=".3"/>
    <path d="M14 41h92a8 8 0 0 1 8 8v52a16 16 0 0 1-16 16H22a16 16 0 0 1-16-16V49a8 8 0 0 1 8-8Z" fill="${glass}"/>
    <rect x="24" y="58" width="72" height="34" rx="5" fill="#ffffff" opacity=".8"/>
    <rect x="32" y="66" width="30" height="4" rx="2" fill="${NAVY}" opacity=".5"/>
    <rect x="32" y="76" width="18" height="4" rx="2" fill="${AZURE}" opacity=".85"/>
  </g>`;
}

/** A slim toner bottle with a tall cap. */
function tonerBottle(x, y, s, glass, cap) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="52" y="0" width="36" height="12" rx="4" fill="${cap}"/>
    <rect x="48" y="10" width="44" height="30" rx="4" fill="${cap}" opacity=".92"/>
    <path d="M36 42h68a8 8 0 0 1 8 8v132a12 12 0 0 1-12 12H40a12 12 0 0 1-12-12V50a8 8 0 0 1 8-8Z" fill="${glass}"/>
    <rect x="40" y="72" width="60" height="52" rx="5" fill="#ffffff" opacity=".8"/>
    <rect x="48" y="82" width="32" height="4" rx="2" fill="${NAVY}" opacity=".5"/>
    <rect x="48" y="92" width="20" height="4" rx="2" fill="${AZURE}" opacity=".85"/>
    <rect x="48" y="104" width="36" height="3" rx="1.5" fill="${NAVY}" opacity=".28"/>
    <rect x="36" y="52" width="10" height="120" rx="5" fill="#ffffff" opacity=".18"/>
  </g>`;
}

/** Concentric glow rings — a "care" motif, no green. */
function careRings(cx, cy, count, spread) {
  let out = "";

  for (let i = 0; i < count; i++) {
    const rad = spread * (0.28 + (i / count) * 0.72);

    out += `<circle cx="${cx}" cy="${cy}" r="${rad.toFixed(0)}" fill="none" stroke="${AZURE_PALE}" stroke-opacity="${(0.42 - i * 0.045).toFixed(3)}" stroke-width="1.6"/>`;
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Stills
 * ------------------------------------------------------------------ */

async function writeSvg(svg, file) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, quality: 92 }).toFile(file);

  const { size } = statSync(file);

  console.log(`  wrote ${file.replace(root + "\\", "")} — ${(size / 1024).toFixed(1)} kB`);
}

console.log("Generating stills…");

/* 1. Serum trio — hero product shot */
await writeSvg(
  backdrop(
    1200,
    900,
    11,
    ["url(#glowA)", "url(#glowB)", "url(#glowC)"],
    `    ${serumBottle(300, 300, 2.1, "#C2D6EE", NAVY)}
    ${creamJar(600, 470, 1.9, "#DDE9F6", AZURE)}
    ${tonerBottle(470, 360, 1.5, "#C2D6EE", NAVY_MID)}`
  ),
  join(imgDir, "showcase-serum.png")
);

/* 2. Cream jar close-up */
await writeSvg(
  backdrop(
    900,
    900,
    23,
    ["url(#glowC)", "url(#glowA)"],
    `    ${careRings(450, 450, 6, 380)}
    ${creamJar(270, 300, 3.4, "#EFF5FB", AZURE)}`
  ),
  join(imgDir, "showcase-cream.png")
);

/* 3. Toner bottle close-up */
await writeSvg(
  backdrop(
    900,
    900,
    37,
    ["url(#glowB)", "url(#glowC)"],
    `    ${careRings(450, 450, 6, 380)}
    ${tonerBottle(300, 250, 3.1, "#C2D6EE", NAVY)}`
  ),
  join(imgDir, "showcase-toner.png")
);

/* 4. Brand texture wash — wide, for section backdrops */
await writeSvg(
  backdrop(
    1600,
    900,
    51,
    ["url(#glowA)", "url(#glowB)", "url(#glowC)", "url(#glowA)"],
    `    <g opacity=".5">
      ${careRings(400, 300, 7, 320)}
      ${careRings(1250, 640, 7, 320)}
    </g>
    <g opacity=".9">
      ${serumBottle(300, 300, 1.3, "#C2D6EE", NAVY)}
      ${creamJar(760, 380, 1.2, "#DDE9F6", AZURE)}
      ${tonerBottle(1100, 330, 1.0, "#C2D6EE", NAVY_MID)}
    </g>`
  ),
  join(imgDir, "texture-wash.png")
);

/* 5. Care ritual — flat lay of four */
await writeSvg(
  backdrop(
    1200,
    1200,
    67,
    ["url(#glowB)", "url(#glowA)", "url(#glowC)"],
    `    ${serumBottle(120, 140, 1.5, "#C2D6EE", NAVY)}
    ${creamJar(600, 190, 1.4, "#EFF5FB", AZURE)}
    ${tonerBottle(300, 560, 1.4, "#C2D6EE", NAVY_MID)}
    ${serumBottle(760, 600, 1.3, "#DDE9F6", AZURE)}`
  ),
  join(imgDir, "ritual-flatlay.png")
);

/* 6. Map / Madagascar silhouette motif */
await writeSvg(
  frame(
    1200,
    700,
    `    <rect width="1200" height="700" fill="${NAVY_DEEP}"/>
    <circle cx="960" cy="180" r="420" fill="url(#glowA)"/>
    <circle cx="220" cy="580" r="380" fill="url(#glowB)"/>
    <path d="M690 130c58 26 96 78 92 138-3 46-34 78-24 122 12 52 62 70 60 128-2 62-58 96-118 108-56 12-118-4-166 26-44 28-58 84-112 96-50 12-104-14-138-54-36-42-52-100-38-152 12-46 48-80 56-126 10-58-24-114 4-166 26-48 84-72 136-88 70-22 130-62 196-58 34 2 60 14 90 26Z"
      fill="none" stroke="${AZURE_LIGHT}" stroke-opacity=".5" stroke-width="2.4"/>
    <path d="M690 130c58 26 96 78 92 138-3 46-34 78-24 122 12 52 62 70 60 128-2 62-58 96-118 108-56 12-118-4-166 26-44 28-58 84-112 96-50 12-104-14-138-54-36-42-52-100-38-152 12-46 48-80 56-126 10-58-24-114 4-166 26-48 84-72 136-88 70-22 130-62 196-58 34 2 60 14 90 26Z"
      fill="${AZURE}" opacity=".1"/>
    ${careRings(700, 380, 5, 300)}
    <text x="80" y="120" fill="#ffffff" font-size="54" font-weight="700" letter-spacing="2" font-family="Georgia, serif">Madagascar</text>
    <text x="80" y="164" fill="${AZURE_PALE}" font-size="22" font-weight="500" letter-spacing="6" font-family="Arial, sans-serif">ANTANARARIVO &#183; MADAGASCAR</text>`
  ),
  join(imgDir, "map-madagascar.png")
);

/* 7. Video poster — same family as the film so there is no flash */
await writeSvg(
  frame(
    1600,
    900,
    `    <rect width="1600" height="900" fill="${NAVY_DEEP}"/>
    <circle cx="380" cy="240" r="520" fill="url(#glowA)"/>
    <circle cx="1280" cy="700" r="480" fill="url(#glowC)"/>
    ${serumBottle(560, 300, 2.6, "#C2D6EE", NAVY)}
    ${creamJar(880, 430, 2.2, "#DDE9F6", AZURE)}
    ${tonerBottle(760, 360, 1.7, "#C2D6EE", NAVY_MID)}
    <text x="80" y="820" fill="#ffffff" font-size="46" font-weight="700" font-family="Georgia, serif">JK Glow</text>
    <text x="80" y="862" fill="${AZURE_PALE}" font-size="18" font-weight="500" letter-spacing="5" font-family="Arial, sans-serif">K-BEAUTY DISTRIBUTION</text>`
  ),
  join(imgDir, "video-poster.png")
);

/* ------------------------------------------------------------------ *
 * Brand film — 12s seamless loop, silent
 * ------------------------------------------------------------------ */

console.log("\nRendering brand film frames…");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const FPS = 24;
const SECONDS = 12;
const W = 1280;
const H = 720;
const frames = [];

for (let i = 0; i < FPS * SECONDS; i++) {
  const t = i / (FPS * SECONDS);
  const wave = Math.sin(t * Math.PI * 2);

  const svg = frame(
    W,
    H,
    `    <rect width="${W}" height="${H}" fill="${NAVY_DEEP}"/>

    <circle cx="${(240 + wave * 90).toFixed(0)}" cy="${(180 - wave * 50).toFixed(0)}" r="440" fill="url(#glowA)"/>
    <circle cx="${(1060 - wave * 70).toFixed(0)}" cy="${(600 + wave * 60).toFixed(0)}" r="420" fill="url(#glowC)"/>
    <circle cx="${(700 + wave * 40).toFixed(0)}" cy="${(120 + wave * 80).toFixed(0)}" r="320" fill="url(#glowB)"/>

    <g opacity="${(0.35 + wave * 0.12).toFixed(3)}">
      ${careRings(640, 360, 7, 330)}
    </g>

    <g transform="translate(0 ${(wave * 14).toFixed(1)})">
      ${serumBottle(400, 300, 1.9, "#C2D6EE", NAVY)}
      ${creamJar(690, 400, 1.7, "#DDE9F6", AZURE)}
      ${tonerBottle(560, 350, 1.3, "#C2D6EE", NAVY_MID)}
    </g>

    <rect x="0" y="${(H - 6).toFixed(0)}" width="${(W * t).toFixed(0)}" height="6" fill="${AZURE_LIGHT}" opacity=".7"/>`
  );

  const file = join(tmpDir, `f${String(i).padStart(4, "0")}.png`);

  await sharp(Buffer.from(svg)).png({ compressionLevel: 1 }).toFile(file);
  frames.push(file);
}

console.log(`  ${frames.length} frames rendered, encoding H.264…`);

const out = join(vidDir, "brand-film.mp4");

await run(
  ffmpeg,
  [
    "-y",
    "-framerate", String(FPS),
    "-i", join(tmpDir, "f%04d.png"),
    "-c:v", "libx264",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-crf", "28",
    "-preset", "slow",
    "-movflags", "+faststart",
    "-an",
    out,
  ],
  { maxBuffer: 1024 * 1024 * 32 }
);

rmSync(tmpDir, { recursive: true, force: true });

const { size } = statSync(out);

console.log(`  wrote assets/video/brand-film.mp4 — ${(size / 1024).toFixed(0)} kB`);

/* A tiny inline SVG favicon set stays hand-written; nothing else to do. */
console.log("\nDone.");
