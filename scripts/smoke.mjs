import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = 4173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const pages = [
  "index.html",
  "about.html",
  "contact.html",
  "legal.html",
  "privacy.html",
  "thanks.html",
  "404.html",
  "fr/index.html",
  "fr/a-propos.html",
  "fr/contact.html",
  "fr/mentions-legales.html",
  "fr/politique-de-confidentialite.html",
  "fr/thanks.html",
  "fr/404.html",
];

const assets = [
  "assets/css/app.css",
  "assets/js/theme.js",
  "assets/js/nav.js",
  "favicon.svg",
  "site.webmanifest",
  "assets/video/brand-film.mp4",
  "sitemap.xml",
  "robots.txt",
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = join(root, normalize(rel));

  if (!file.startsWith(root)) {
    res.writeHead(403).end("no");
    return;
  }

  try {
    const info = await stat(file);

    if (info.isDirectory()) throw new Error("dir");

    const body = await readFile(file);
    const type = types[extname(file).toLowerCase()] || "application/octet-stream";

    res.writeHead(200, { "content-type": type, "content-length": body.length }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" }).end("404");
  }
});

await new Promise((r) => server.listen(port, r));

let pass = 0;
const fail = [];

async function get(path) {
  const res = await fetch("http://localhost:" + port + "/" + path);
  return { status: res.status, type: res.headers.get("content-type") || "" };
}

for (const page of pages) {
  const r = await get(page);

  if (r.status === 200 && r.type.startsWith("text/html")) pass++;
  else fail.push(page + " -> " + r.status + " " + r.type);
}

for (const asset of assets) {
  const r = await get(asset);
  const want = types[extname(asset).toLowerCase()];

  if (r.status === 200 && r.type === want) pass++;
  else fail.push(asset + " -> " + r.status + " " + r.type + " (want " + want + ")");
}

/* nav.js must be deferred and theme.js must block, on every page. */
for (const page of pages) {
  const text = await (await fetch("http://localhost:" + port + "/" + page)).text();
  const themeBlocking = /<script src="[^"]*theme\.js"><\/script>/.test(text);
  const navDeferred = /<script src="[^"]*nav\.js" defer><\/script>/.test(text);

  if (themeBlocking && navDeferred) pass++;
  else fail.push(page + " script loading: theme=" + themeBlocking + " nav-defer=" + navDeferred);
}

server.close();

console.log("smoke: " + pass + "/" + (pages.length + assets.length + pages.length) + " checks passed");

if (fail.length) {
  for (const f of fail) console.log("  FAIL  " + f);
  process.exitCode = 1;
} else {
  console.log("all assets, pages and script tags OK");
}
