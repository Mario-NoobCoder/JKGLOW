import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => join(root, p);

const leafCluster = await readFile(out("assets/img/leaf-cluster.svg"), "utf8");

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#16324F"/>
      <stop offset=".55" stop-color="#0E1E30"/>
      <stop offset="1" stop-color="#08111C"/>
    </linearGradient>
    <radialGradient id="spot" cx=".72" cy=".42" r=".5">
      <stop offset="0" stop-color="#6793D2" stop-opacity=".38"/>
      <stop offset="1" stop-color="#6793D2" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#spot)"/>

  <g transform="translate(700 78) scale(1.06)" opacity=".95">
    ${leafCluster.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="none" aria-hidden="true">', "").replace("</svg>", "")}
  </g>

  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <text x="80" y="252" fill="#97B8E2" font-size="22" font-weight="600" letter-spacing="4">K-BEAUTY DISTRIBUTION</text>
    <text x="80" y="336" fill="#FFFFFF" font-size="76" font-weight="700" letter-spacing="-1">JK Glow</text>
    <text x="80" y="392" fill="#A8B8CA" font-size="30" font-weight="400">Selected Korean beauty brands,</text>
    <text x="80" y="432" fill="#A8B8CA" font-size="30" font-weight="400">distributed in Madagascar.</text>
  </g>

  <rect x="80" y="492" width="72" height="4" rx="2" fill="#4473BF"/>
  <text x="80" y="546" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="#74879F" font-size="22" font-weight="500">Official SKIN1004 Distribution Partner</text>
</svg>`;

const favicon = await readFile(out("favicon.svg"), "utf8");

const touch = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
${favicon.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="JK Glow">', "").replace("</svg>", "")}
</svg>`;

const jobs = [
  [Buffer.from(og), "assets/img/og-cover.png"],
  [Buffer.from(touch), "assets/img/apple-touch-icon.png", 180],
  [Buffer.from(touch), "assets/img/icon-192.png", 192],
  [Buffer.from(touch), "assets/img/icon-512.png", 512],
];

for (const [input, target, width] of jobs) {
  let pipeline = sharp(input);
  if (width) pipeline = pipeline.resize(width, width, { fit: "fill" });
  const { size } = await pipeline
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(out(target));
  const meta = await sharp(out(target)).metadata();
  console.log(`wrote ${target} — ${meta.width}x${meta.height}, ${(size / 1024).toFixed(1)} kB`);
}

const manifest = {
  name: "JK Glow",
  short_name: "JK Glow",
  description: "K-Beauty distribution in Madagascar.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#0B1524",
  theme_color: "#102A43",
  icons: [
    { src: "assets/img/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "assets/img/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
  ],
};
await writeFile(out("site.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote site.webmanifest");
