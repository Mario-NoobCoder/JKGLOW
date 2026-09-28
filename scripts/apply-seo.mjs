/**
 * SEO pass — titles, meta descriptions, absolute canonicals, Open Graph and
 * organisation structured data.
 *
 * Everything this script writes lives inside a single delimited block, so the
 * pass is idempotent: the previous block is removed before the new one is
 * injected, and the legacy relative canonical / og:title lines it supersedes
 * are cleaned up too.
 *
 * Adding a page means adding one entry to SEO. No markup to hand-maintain.
 *
 * Run: node scripts/apply-seo.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ORIGIN = "https://www.jkglow.com";
const OPEN = "<!-- @seo -->";
const CLOSE = "<!-- /@seo -->";

/**
 * Only facts the site already states are used here. In particular there is no
 * street address, no phone number and no founding date: those are not known
 * yet, and inventing them would poison the local SEO data.
 */
const ORG = {
  name: "JK Glow",
  legalName: "JK Glow",
  url: ORIGIN + "/",
  logo: ORIGIN + "/assets/img/icon-512.png",
  email: "hello@jkglow.com",
  description:
    "JK Glow is a Korean beauty distributor based in Madagascar, bringing selected K-Beauty brands to local retailers, pharmacies and beauty professionals.",
  areaServed: ["Madagascar", "Africa"],
};

const ADDRESS = {
  "@type": "PostalAddress",
  addressLocality: "Antananarivo",
  addressCountry: "MG",
};

/**
 * title / description per page. The French pages carry their own copy rather
 * than a translation of the English, since they target a different reader.
 */
const PAGES = {
  "index.html": {
    title: "JK Glow | K-Beauty Distribution in Madagascar",
    description:
      "JK Glow is a Korean beauty distributor based in Madagascar, bringing selected K-Beauty brands to local retailers, pharmacies and beauty professionals.",
  },
  "fr/index.html": {
    title: "JK Glow | Distribution de K-beauté à Madagascar",
    description:
      "JK Glow est un distributeur de K-beauté basé à Madagascar, au plus près des pharmacies, instituts de beauté et revendeurs locaux.",
  },
  "about.html": {
    title: "About Us | JK Glow, K-Beauty Distributor in Madagascar",
    description:
      "From the creation of JK Glow to the launch of SKIN1004 in Madagascar: who we are, how we work with Korean brands, and our vision for Africa.",
  },
  "fr/a-propos.html": {
    title: "À propos | JK Glow, distributeur de K-beauté à Madagascar",
    description:
      "De la création de JK Glow au lancement de SKIN1004 à Madagascar : qui nous sommes, notre parcours et notre vision pour l'Afrique.",
  },
  "contact.html": {
    title: "Contact | Become a JK Glow Partner in Madagascar",
    description:
      "Pharmacy, beauty institute or retailer in Madagascar? Korean beauty brand looking to enter the market? Send JK Glow a B2B request.",
  },
  "fr/contact.html": {
    title: "Contact | Devenir partenaire JK Glow à Madagascar",
    description:
      "Pharmacie, institut de beauté ou revendeur à Madagascar ? Vous êtes une marque coréenne et souhaitez entrer sur le marché ? Écrivez-nous.",
  },
  "skin1004.html": {
    title: "SKIN1004 in Madagascar | Official Distribution — JK Glow",
    description:
      "JK Glow is the official SKIN1004 distribution partner in Madagascar. Centella Asiatica ranges for pharmacies, beauty professionals and retailers.",
  },
  "fr/skin1004.html": {
    title: "SKIN1004 à Madagascar | Distribution officielle — JK Glow",
    description:
      "JK Glow est le partenaire officiel de distribution SKIN1004 à Madagascar. Des gammes au Centella Asiatica pour pharmacies, instituts et revendeurs.",
  },
  "legal.html": {
    title: "Legal Notice | JK Glow",
    description: "Publisher information, hosting and intellectual property for the JK Glow website.",
  },
  "fr/mentions-legales.html": {
    title: "Mentions légales | JK Glow",
    description: "Informations sur l'éditeur, l'hébergement et la propriété intellectuelle du site JK Glow.",
  },
  "privacy.html": {
    title: "Privacy Policy | JK Glow",
    description: "How JK Glow collects, uses and protects the personal data submitted through this website.",
  },
  "fr/politique-de-confidentialite.html": {
    title: "Politique de confidentialité | JK Glow",
    description: "Comment JK Glow collecte, utilise et protège les données personnelles transmises via ce site.",
  },
  "thanks.html": {
    title: "Thank You | JK Glow",
    description: "Your request has been received. The JK Glow team will get back to you shortly.",
  },
  "fr/thanks.html": {
    title: "Merci | JK Glow",
    description: "Votre demande a bien été reçue. L'équipe JK Glow vous répondra prochainement.",
  },
  "404.html": {
    title: "Page Not Found | JK Glow",
    description: "This page does not exist. Return to the JK Glow homepage: K-Beauty distribution in Madagascar.",
  },
  "fr/404.html": {
    title: "Page introuvable | JK Glow",
    description: "Cette page n'existe pas. Revenez à l'accueil JK Glow : distribution de K-beauté à Madagascar.",
  },
};

/** Extra structured data for the pages that deserve more than the default. */
function structuredData(file) {
  const graph = [
    {
      "@type": "Organization",
      "@id": ORIGIN + "/#organization",
      name: ORG.name,
      legalName: ORG.legalName,
      url: ORG.url,
      logo: ORG.logo,
      email: ORG.email,
      description: ORG.description,
      areaServed: ORG.areaServed,
    },
    {
      "@type": "WholesaleStore",
      "@id": ORIGIN + "/#localbusiness",
      name: ORG.name,
      url: ORG.url,
      email: ORG.email,
      image: ORIGIN + "/assets/img/og-cover.png",
      description: ORG.description,
      address: ADDRESS,
      areaServed: ORG.areaServed,
      parentOrganization: { "@id": ORIGIN + "/#organization" },
      knowsAbout: ["K-Beauty", "Korean beauty brands", "Distribution", "Madagascar"],
    },
  ];

  if (file === "contact.html" || file === "fr/contact.html") {
    graph.push({
      "@type": "ContactPage",
      "@id": ORIGIN + "/" + file + "#webpage",
      url: ORIGIN + "/" + file,
      name: "Contact",
      isPartOf: { "@id": ORIGIN + "/#website" },
      about: { "@id": ORIGIN + "/#organization" },
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * hreflang has to be absolute, and the EN page is the x-default because it is
 * the version aimed at the Korean brands the site also wants to reach.
 */
const PAIRS = {
  "index.html": "fr/index.html",
  "fr/index.html": "index.html",
  "about.html": "fr/a-propos.html",
  "fr/a-propos.html": "about.html",
  "contact.html": "fr/contact.html",
  "fr/contact.html": "contact.html",
  "skin1004.html": "fr/skin1004.html",
  "fr/skin1004.html": "skin1004.html",
  "legal.html": "fr/mentions-legales.html",
  "fr/mentions-legales.html": "legal.html",
  "privacy.html": "fr/politique-de-confidentialite.html",
  "fr/politique-de-confidentialite.html": "privacy.html",
  "thanks.html": "fr/thanks.html",
  "fr/thanks.html": "thanks.html",
  "404.html": "fr/404.html",
  "fr/404.html": "404.html",
};

function hreflang(file) {
  const en = enOf(file);
  const other = PAIRS[file];

  return [
    `  <link rel="alternate" hreflang="en" href="${ORIGIN}/${en}" />`,
    `  <link rel="alternate" hreflang="fr" href="${ORIGIN}/${other}" />`,
    `  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/${en}" />`,
  ].join("\n");
}

function block(file, seo) {
  const path = file.replace(/^fr\//, "");
  const url = ORIGIN + "/" + file;
  const image = ORIGIN + "/assets/img/og-cover.png";
  const title = esc(seo.title);
  const description = esc(seo.description);

  return [
    OPEN,
    `  <title>${title}</title>`,
    `  <meta name="description" content="${description}" />`,
    `  <link rel="canonical" href="${url}" />`,
    hreflang(file),
    `  <meta property="og:type" content="website" />`,
    `  <meta property="og:url" content="${url}" />`,
    `  <meta property="og:title" content="${title}" />`,
    `  <meta property="og:description" content="${description}" />`,
    `  <meta property="og:image" content="${image}" />`,
    `  <meta name="twitter:title" content="${title}" />`,
    `  <meta name="twitter:description" content="${description}" />`,
    `  <meta name="twitter:image" content="${image}" />`,
    `  <script type="application/ld+json">${JSON.stringify(structuredData(file))}</script>`,
    CLOSE,
  ].join("\n");
}

/**
 * Sitemap.
 *
 * Generated from PAGES and PAIRS rather than maintained by hand: the two
 * lists above already have to be right for the canonicals and the hreflang
 * tags, so deriving the sitemap from them means a new page cannot be indexed
 * with a correct canonical and still be missing from the sitemap.
 *
 * The French pages are the same documents in another language, so only the
 * English URL is listed, with the French one attached as an alternate — which
 * is what Google expects from a hreflang set. 404 is deliberately absent: an
 * error page has no business in an index.
 */
const PRIORITY = {
  "index.html": "1.0",
  "contact.html": "0.9",
  "skin1004.html": "0.9",
  "about.html": "0.8",
  "legal.html": "0.3",
  "privacy.html": "0.3",
  "thanks.html": "0.2",
};

const EXCLUDED = new Set(["404.html", "fr/404.html"]);

const enOf = (file) => (file.startsWith("fr/") ? PAIRS[file] : file);

function sitemap() {
  /*
   * One entry per language pair, keyed on the English page: listing the
   * French document as well would ask the crawler to index the same content
   * twice under two URLs.
   */
  const entries = Object.keys(PAGES)
    .filter((file) => !file.startsWith("fr/") && !EXCLUDED.has(file))
    .sort((a, b) => PRIORITY[b].localeCompare(PRIORITY[a]) || a.localeCompare(b));

  const urls = entries
    .map((file) => {
      const en = file;
      const other = PAIRS[file];

      return [
        "  <url>",
        `    <loc>${ORIGIN}/${en}</loc>`,
        `    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}/${en}" />`,
        `    <xhtml:link rel="alternate" hreflang="fr" href="${ORIGIN}/${other}" />`,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/${en}" />`,
        `    <priority>${PRIORITY[en]}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function writeSitemap() {
  const target = join(root, "sitemap.xml");
  const next = sitemap();

  if (existsSync(target) && readFileSync(target, "utf8") === next) {
    console.log("  ==  sitemap.xml");
    return;
  }

  writeFileSync(target, next, "utf8");
  console.log("  ->  sitemap.xml");
}

let updated = 0;

for (const [file, seo] of Object.entries(PAGES)) {
  const target = join(root, file);

  if (!existsSync(target)) {
    console.log(`  --  ${file} (not created yet, skipped)`);
    continue;
  }

  let html = readFileSync(target, "utf8");
  if (seo.title.length > 60) console.warn(`  ! ${file}: title is ${seo.title.length} chars (aim <= 60)`);
  if (seo.description.length > 160) console.warn(`  ! ${file}: description is ${seo.description.length} chars (aim <= 160)`);

  const next = block(file, seo);

  /* Remove the previous managed block, then the legacy lines it supersedes. */
  html = html.replace(new RegExp(`\\s*${OPEN}[\\s\\S]*?${CLOSE}`), "");

  html = html
    .replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<link rel="alternate"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta property="og:title"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta property="og:type"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta property="og:image"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta property="og:url"[^>]*>\r?\n?/g, "");

  if (!/<\/head>/i.test(html)) {
    console.error(`  ! ${file}: no </head>, skipped`);
    continue;
  }

  html = html.replace(/([ \t]*)<\/head>/i, (_, indent) => "\n" + next.replace(/^/gm, indent) + "\n" + indent + "</head>");

  if (html !== readFileSync(target, "utf8")) {
    writeFileSync(target, html, "utf8");
    updated++;
    console.log(`  ->  ${file}`);
  } else {
    console.log(`  ==  ${file}`);
  }
}

writeSitemap();

console.log(`\n${updated} page(s) updated · ${Object.keys(PAGES).length} configured · origin ${ORIGIN}`);
