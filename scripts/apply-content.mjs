/**
 * Content pass — the things that are facts about the business rather than
 * decoration: navigation targets, the professional category pictograms, the
 * calls to action and their form pre-selection, and the contact details.
 *
 * The contact details live in CONTACT below and are deliberately left
 * unresolved rather than invented. Filling them in is a one-line change here
 * followed by a re-run, so the real WhatsApp number, Instagram handle or street
 * address never has to be edited across sixteen pages.
 *
 * Every rule is idempotent. Run: node scripts/apply-content.mjs [--dry]
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

/* ------------------------------------------------------------------ *
 * Contact details — the single source of truth
 * ------------------------------------------------------------------ */

const CONTACT = {
  email: "hello@jkglow.com",

  /*
   * Set whatsapp to a digits-only international number to switch the WhatsApp
   * entries on everywhere. Left null, they render as an explicit placeholder
   * rather than a link to a number that does not exist.
   */
  whatsapp: null,
  whatsappLabel: "+261 …", // EN
  whatsappLabelFr: "+261 …",

  instagram: null,
  instagramLabel: "@jkglow",

  city: "Antananarivo, Madagascar",
};

/* ------------------------------------------------------------------ *
 * 1. Navigation targets
 * ------------------------------------------------------------------ */

/*
 * "Our Brands" is a real page now, so the menu points at it rather than at a
 * homepage anchor. The fragment links for the professional sections stay
 * anchored on the homepage, which is where those sections live.
 */
function navTargets(html) {
  return html.replace(/href="index\.html#brands"/g, 'href="skin1004.html"');
}

/*
 * aria-current has to mark the page you are on and nothing else. It was
 * sitting on the "Our Brands" link of the homepage, which announced two
 * current links at once. Fragment links are left alone: they point inside the
 * current page, so "current page" is not what they mean.
 */
function ariaCurrent(html, file) {
  const dir = dirname(join(root, file));

  return html.replace(
    /<a\s+href="([^"]+)"\s+class="nav-link"(\s+aria-current="page")?\s*>/g,
    (match, href, current) => {
      if (href.includes("#")) return match.replace(/\s+aria-current="page"/, "");

      const target = resolve(dir, href).split(sep).join("/");
      const self = join(root, file).split(sep).join("/");
      const wanted = target === self ? ' aria-current="page"' : "";

      return `<a href="${href}" class="nav-link"${wanted}>`;
    }
  );
}

/* ------------------------------------------------------------------ *
 * 2. Professional categories as pictograms
 * ------------------------------------------------------------------ */

/*
 * The five channels JK Glow serves, each with an icon. The paths are plain
 * closed geometry so they stay legible at 20px and inherit the accent colour.
 */
const PICTOS = {
  en: [
    {
      key: "Pharmacies &amp; Parapharmacies",
      d: ["M10 4.5h4v5.5h5.5v4H14v5.5h-4V14H4.5v-4H10V4.5Z"],
    },
    {
      key: "Beauty Institutes &amp; Spas",
      d: ["M20 4.5C20 13 15.5 17 8.5 17H4.5C4.5 8.5 9 4.5 17.5 4.5H20Z", "M4.5 19.5C7 14 11 10.5 16 8.5"],
    },
    {
      key: "Concept Stores",
      d: ["M6.5 8.5h11l-.9 11.1a1 1 0 0 1-1 .9H8.4a1 1 0 0 1-1-.9L6.5 8.5Z", "M9.2 10.5V7.6a2.8 2.8 0 0 1 5.6 0v2.9"],
    },
    {
      key: "Specialized Retailers",
      d: ["M4 9.5h16", "M5.5 9.5v9.5h13V9.5", "M4 9.5 6.2 5h11.6L20 9.5", "M9.75 19v-5.25h4.5V19"],
    },
    {
      key: "Hotels &amp; Hospitality",
      d: ["M4.5 20V6.5h9V20", "M13.5 20V11h6v9", "M3 20h18", "M7 9.5h1.5M7 12.5h1.5M7 15.5h1.5M15.5 14h1.5M15.5 16.5h1.5"],
    },
  ],
  fr: [
    {
      key: "Pharmacies &amp; Parapharmacies",
      d: ["M10 4.5h4v5.5h5.5v4H14v5.5h-4V14H4.5v-4H10V4.5Z"],
    },
    {
      key: "Instituts &amp; Spas",
      d: ["M20 4.5C20 13 15.5 17 8.5 17H4.5C4.5 8.5 9 4.5 17.5 4.5H20Z", "M4.5 19.5C7 14 11 10.5 16 8.5"],
    },
    {
      key: "Concept Stores",
      d: ["M6.5 8.5h11l-.9 11.1a1 1 0 0 1-1 .9H8.4a1 1 0 0 1-1-.9L6.5 8.5Z", "M9.2 10.5V7.6a2.8 2.8 0 0 1 5.6 0v2.9"],
    },
    {
      key: "Retailers spécialisés",
      d: ["M4 9.5h16", "M5.5 9.5v9.5h13V9.5", "M4 9.5 6.2 5h11.6L20 9.5", "M9.75 19v-5.25h4.5V19"],
    },
    {
      key: "Hôtels &amp; Hospitalité",
      d: ["M4.5 20V6.5h9V20", "M13.5 20V11h6v9", "M3 20h18", "M7 9.5h1.5M7 12.5h1.5M7 15.5h1.5M15.5 14h1.5M15.5 16.5h1.5"],
    },
  ],
};

const CHIP = 'class="rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-sm font-medium"';

function categoryPictograms(html, lang) {
  let out = html;

  for (const { key, d } of PICTOS[lang]) {
    const search = `${CHIP}>${key}</li>`;

    if (!out.includes(search)) continue;

    const paths = d
      .map((p) => `<path stroke-linecap="round" stroke-linejoin="round" d="${p}" />`)
      .join("");

    const icon =
      `<svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-accent" fill="none" ` +
      `stroke="currentColor" stroke-width="1.6" aria-hidden="true">${paths}</svg>`;

    out = out.replace(search, `class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-sm font-medium">${icon}<span>${key}</span></li>`);
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * 3. Calls to action, carrying the intent into the form
 * ------------------------------------------------------------------ */

/*
 * The two audiences land on the same form, so the link states which one the
 * visitor is. nav.js reads the parameters and selects the matching field.
 */
function ctaTargets(html) {
  /*
   * The patterns are assembled from strings rather than written as literals:
   * a trailing ")" sitting next to a regex terminator is exactly the kind of
   * sequence that gets mangled when the file is written, and the symptom is
   * silent — the extra character eats the "<" of the following </a>.
   */
  const anchor = (classes, labels) =>
    new RegExp(
      '(<a href=")contact\\.html(" class="' + classes + '">(?:' + labels + '))',
      "g"
    );

  return html
    .replace(
      anchor(
        "btn btn-3d btn-primary btn-lg mt-11 glint",
        "Become a JK Glow Partner|Devenir partenaire JK Glow"
      ),
      "$1contact.html?interest=retailer$2"
    )
    .replace(
      anchor(
        "btn btn-3d btn-secondary btn-lg mt-10 glint",
        "Let’s Explore a Partnership|Étudier un partenariat"
      ),
      "$1contact.html?type=brand$2"
    );
}

/* ------------------------------------------------------------------ *
 * 4. The Korean brand option in the form
 * ------------------------------------------------------------------ */

const BRAND_OPTION = {
  en: '<option value="Korean Beauty Brand">Korean Beauty Brand</option>',
  fr: '<option value="Korean Beauty Brand">Marque de beauté coréenne</option>',
};

function formBrandOption(html, lang) {
  if (html.includes(BRAND_OPTION[lang])) return html;

  const anchor =
    lang === "fr"
      ? '<option value="Distributeur">Distributeur</option>'
      : '<option value="Distributor">Distributor</option>';

  if (!html.includes(anchor)) return html;

  return html.replace(anchor, anchor + "\n\t\t\t\t\t\t\t" + BRAND_OPTION[lang]);
}

/* ------------------------------------------------------------------ *
 * 5. Contact details
 * ------------------------------------------------------------------ */

function placeholder(label) {
  return `<span class="text-fg-subtle">${label} <span class="text-accent">(&agrave; compl&eacute;ter)</span></span>`;
}

function contactDetails(html, lang) {
  let out = html;
  const waLabel = lang === "fr" ? CONTACT.whatsappLabelFr : CONTACT.whatsappLabel;
  const wa = CONTACT.whatsapp
    ? `<a href="https://wa.me/${CONTACT.whatsapp}" class="link" target="_blank" rel="noopener noreferrer">${waLabel}</a>`
    : placeholder(waLabel);
  const ig = CONTACT.instagram
    ? `<a href="https://instagram.com/${CONTACT.instagram}" class="link" target="_blank" rel="noopener noreferrer">${CONTACT.instagramLabel}</a>`
    : placeholder(CONTACT.instagramLabel);

  /* Footer list entry. */
  out = out.replace(
    /<li><a href="https:\/\/wa\.me\/261000000000" class="link" target="_blank" rel="noopener noreferrer">\+261 00 00 0000<\/a><\/li>/g,
    `<li>${wa}</li>`
  );

  out = out.replace(
    /<li><a href="https:\/\/instagram\.com\/jkglow" class="link" target="_blank" rel="noopener noreferrer">Instagram<\/a><\/li>/g,
    `<li>${ig}</li>`
  );

  /* Contact page and legal notice inline links. */
  out = out.replace(
    /<a href="https:\/\/wa\.me\/261000000000" class="link" target="_blank" rel="noopener noreferrer">\+261 00 00 0000<\/a>/g,
    wa
  );

  out = out.replace(
    /<a href="https:\/\/wa\.me\/261000000000" class="link mt-1 inline-block text-sm" target="_blank" rel="noopener noreferrer">\+261 00 00 0000<\/a>/g,
    wa.replace('class="link"', 'class="link mt-1 inline-block text-sm"')
  );

  out = out.replace(
    /<a href="https:\/\/instagram\.com\/jkglow" class="link" target="_blank" rel="noopener noreferrer">Instagram<\/a>/g,
    ig
  );

  return out;
}

/* ------------------------------------------------------------------ *
 * 6. The "prefer to talk" card
 * ------------------------------------------------------------------ */

/*
 * This card is a call to action, so it cannot carry a placeholder: a WhatsApp
 * button pointing at a number that does not exist is a dead end on the page
 * that is supposed to generate enquiries. The button and the sentence that
 * introduces it are both driven by CONTACT, so setting the number in one place
 * and re-running brings the whole thing back.
 */
function talkCard(html, lang) {
  const COPY = {
    en: {
      with: "Message us on WhatsApp or email us directly &mdash; whichever is easier for your team.",
      without: "Email us directly and our team will get back to you.",
      button: "Open WhatsApp",
    },
    fr: {
      with: "Écrivez-nous sur WhatsApp ou directement par e-mail, selon ce qui convient le mieux à votre équipe.",
      without: "Écrivez-nous directement par e-mail et notre équipe vous répondra.",
      button: "Ouvrir WhatsApp",
    },
  };

  const c = COPY[lang];

  const sentence = CONTACT.whatsapp ? c.with : c.without;

  let out = html;

  /*
   * The card is located through its Email button rather than its heading: the
   * heading is translated prose that can be reworded at any time, while the
   * button is markup this script owns.
   */
  const emailBtn = `<a href="mailto:${CONTACT.email}" class="btn btn-3d btn-secondary btn-md glint">Email</a>`;
  const at = out.indexOf(emailBtn);

  if (at < 0) return out;

  /* The intro paragraph is the <p> of the same card, just above the buttons. */
  const cardStart = out.lastIndexOf('<div class="card', at);
  const pStart = out.indexOf('<p class="mt-2.5', cardStart);
  const pEnd = out.indexOf("</p>", pStart);

  if (cardStart < 0 || pStart < 0 || pEnd < 0 || pStart > at) return out;

  out =
    out.slice(0, pStart) +
    `<p class="mt-2.5 text-sm leading-relaxed text-fg-muted">${sentence}</p>` +
    out.slice(pEnd + 4);

  /* Drop any WhatsApp button, then re-add one only when there is a number. */
  out = out.replace(
    new RegExp(
      '<a href="https://wa\\.me/[^"]*" class="btn btn-3d btn-primary btn-md glint" target="_blank" rel="noopener noreferrer">[^<]*</a>',
      "g"
    ),
    ""
  );

  if (CONTACT.whatsapp) {
    const at2 = out.indexOf(emailBtn);

    if (at2 >= 0) {
      const button =
        `<a href="https://wa.me/${CONTACT.whatsapp}" class="btn btn-3d btn-primary btn-md glint" ` +
        `target="_blank" rel="noopener noreferrer">${c.button}</a>`;

      out = out.slice(0, at2) + button + out.slice(at2);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Walk
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 8. The About photo slot
 * ------------------------------------------------------------------ */

/*
 * The About page reads as an unfinished document without a picture of the
 * people behind it, but there is no photograph to put there yet and the four
 * product shots are not a substitute — showing a serum bottle next to "Who we
 * are" would say nothing about the team.
 *
 * So the slot is reserved and labelled instead of filled. The block is written
 * between markers so that dropping a real photo in later is a one-line
 * change, and so that re-running never stacks a second slot on top of the
 * first.
 */
const PHOTO_OPEN = "<!-- @about-photo -->";
const PHOTO_CLOSE = "<!-- /@about-photo -->";

function aboutPhotoSlot(html, lang) {
  if (!html.includes("Who we are") && !html.includes("Qui sommes-nous")) return html;

  if (html.includes(PHOTO_OPEN)) return html;

  const T = {
    en: {
      label: "Photo to come",
      title: "A team built around product knowledge",
      body:
        "We will add a photograph of the JK Glow team here, and one from our meetings with our Korean partners in Seoul. Until then, this space is deliberately left empty rather than filled with a stock image.",
    },
    fr: {
      label: "Photo à venir",
      title: "Une équipe fondée sur la connaissance produit",
      body:
        "Nous ajouterons ici une photographie de l'équipe JK Glow, ainsi qu'une photo de nos rencontres avec nos partenaires coréens à Séoul. D'ici là, cet espace est volontairement laissé vide plutôt que comblé par une image générique.",
    },
  }[lang];

  const block =
    [
      PHOTO_OPEN,
      '\t\t<div class="card overflow-hidden p-0">',
      '\t\t\t<div class="grid gap-0 sm:grid-cols-[0.9fr_1.1fr]">',
      '\t\t\t\t<div class="flex min-h-[16rem] flex-col items-center justify-center gap-4 border-b border-line bg-surface-2 p-8 text-center sm:border-b-0 sm:border-r">',
      '\t\t\t\t\t<span class="grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-white dark:bg-white dark:text-ink-900" aria-hidden="true">',
      '\t\t\t\t\t\t<svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">',
      '\t\t\t\t\t\t\t<rect x="3" y="6.5" width="18" height="13" rx="2.5" />',
      '\t\t\t\t\t\t\t<path d="M3 16.5l4.6-4.2a2 2 0 0 1 2.7 0L15 16" stroke-linecap="round" />',
      '\t\t\t\t\t\t\t<circle cx="15.8" cy="10.4" r="1.4" />',
      "\t\t\t\t\t\t</svg>",
      "\t\t\t\t\t</span>",
      `\t\t\t\t\t<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fg-subtle">${T.label}</p>`,
      "\t\t\t\t</div>",
      '\t\t\t\t<div class="p-8 sm:p-9">',
      `\t\t\t\t\t<h2 class="font-display text-display-3 font-semibold">${T.title}</h2>`,
      `\t\t\t\t\t<p class="measure mt-4 text-sm leading-relaxed text-fg-muted">${T.body}</p>`,
      "\t\t\t\t</div>",
      "\t\t\t</div>",
      "\t\t</div>",
      PHOTO_CLOSE,
    ].join("\n");

  /* Anchored on the section that actually holds the three story cards. */
  const at = html.indexOf("Who we are") > -1 ? html.indexOf("Who we are") : html.indexOf("Qui sommes-nous");

  if (at < 0) return html;

  const olStart = html.lastIndexOf('<ol class="grid gap-6', at);
  const olEnd = html.indexOf("</ol>", olStart);

  if (olStart < 0 || olEnd < 0) return html;

  return (
    html.slice(0, olEnd + 5) + "\n\n\t\t" + block + "\n" + html.slice(olEnd + 5)
  );
}

/* ------------------------------------------------------------------ *
 * 9. Brand page calls to action
 * ------------------------------------------------------------------ */

/*
 * On the brand page, almost every link ends at the same form, and the form
 * only asks one question at a time. A visitor who reads "Become a Partner" has
 * not yet said whether they want to stock the brand or to distribute it, so
 * the page says which one it means and lets nav.js preselect it.
 */
function brandCtaTargets(html) {
  if (!html.includes("skin1004.html")) return html;

  /*
   * Matched on the link text, not the class list: a button's class string is
   * styling that changes without changing what the button does, and a pattern
   * that has to be updated every time it does is a pattern that will one day
   * silently stop matching.
   */
  /*
   * The label has to be found inside the anchor itself, not in the 200
   * characters that follow it: a nav button and the hero button sit close
   * enough together that a lookahead happily reclassifies the nav link
   * according to whatever the hero says.
   */
  /*
   * Split on anchors first and rewrite only the ones whose own content
   * matches. Matching inside a slice that cannot cross an </a> avoids both
   * failure modes at once: a lookahead that reaches into the next element, and
   * a regex that runs past the tag it was meant to stop at.
   */
  const RETAILER = new RegExp(
    "(Stock SKIN1004 through JK Glow|Commandez SKIN1004 via JK Glow" +
      "|Become a Partner|Devenir partenaire" +
      "|Find a Retailer|Trouver un revendeur)"
  );
  const BRAND = /(Korean brand entry|Implantation de marque coréenne)/;
  const RETAILER_FORM = /(Become a retailer|Devenir revendeur|B2B purchasing|Achat B2B)/;

  return html
    .split(/(<a\b[\s\S]*?<\/a>)/)
    .map((chunk) => {
      if (!chunk.startsWith("<a")) return chunk;

      if (RETAILER.test(chunk)) return chunk.replace('href="contact.html"', 'href="contact.html?interest=retailer"');
      if (RETAILER_FORM.test(chunk)) return chunk.replace('href="contact.html"', 'href="contact.html?interest=retailer"');
      if (BRAND.test(chunk)) return chunk.replace('href="contact.html"', 'href="contact.html?type=brand"');

      return chunk;
    })
    .join("");
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if ([".git", ".idea", "node_modules", "src", "scripts", "assets"].includes(entry)) continue;

    const full = join(dir, entry);

    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }

  return found;
}

/* ------------------------------------------------------------------ *
 * 7. The brand section on the home page
 * ------------------------------------------------------------------ */

/*
 * The brand now has a page of its own, so the home page has to point at it
 * instead of describing the same thing twice. The two actions are now distinct
 * and mean different things: reading about the brand, and stocking it.
 */
function brandSection(html, lang) {
  const T = {
    en: {
      discover: "Discover SKIN1004",
      order: "Order SKIN1004",
      view: "View the brand page",
    },
    fr: {
      discover: "Découvrir SKIN1004",
      order: "Commander SKIN1004",
      view: "Voir la page marque",
    },
  }[lang];

  const at = html.indexOf('id="brands"');

  if (at < 0) return html;

  let out = html;

  const sectionEnd = () => out.indexOf("</section>", at);

  /*
   * Any earlier copy of the card link is collapsed to one before the section is
   * rebuilt: a pass that is not idempotent has to be able to clean up after
   * itself, or the damage it did once gets frozen into the page.
   */
  const linkRe = new RegExp(
    '\\s*<p class="mt-9 text-sm"><a href="skin1004\\.html" class="link">[^<]*' +
      '<span aria-hidden="true">&nbsp;&rarr;<\\/span><\\/a><\\/p>',
    "g"
  );

  out = out.slice(0, at) + out.slice(at).replace(linkRe, "");

  /* Rewritten as a block so that re-running cannot half-apply it. */
  const divStart = out.indexOf('<div class="mt-9 flex flex-wrap gap-3">', at);
  const divEnd = out.indexOf("</div>", divStart);

  if (divStart < 0 || divEnd < 0) return out;

  const ctas =
    '<div class="mt-9 flex flex-wrap gap-3">\n' +
    `\t\t\t\t\t<a href="skin1004.html" class="btn btn-3d btn-primary btn-md glint">${T.discover}</a>\n` +
    `\t\t\t\t\t<a href="contact.html?interest=retailer" class="btn btn-3d btn-secondary btn-md glint">${T.order}</a>\n` +
    "\t\t\t\t</div>";

  out = out.slice(0, divStart) + ctas + out.slice(divEnd + 6);

  const dlEnd = out.indexOf("</dl>", at);

  if (dlEnd < 0) return out;

  const link =
    `\n\t\t\t\t\t<p class="mt-9 text-sm"><a href="skin1004.html" class="link">${T.view}` +
    '<span aria-hidden="true">&nbsp;&rarr;</span></a></p>';

  out = out.slice(0, dlEnd + 5) + link + out.slice(dlEnd + 5);

  return out;
}

/*
 * "Why JK Glow" is the section a link is most likely to want to reach, and it
 * is the only top-level section with no id of its own.
 */
function whyAnchor(html) {
  if (html.includes('id="why-jkglow"')) return html;

  const at = html.indexOf('id="brands"');

  if (at < 0) return html;

  const next = html.indexOf("<section", html.indexOf("</section>", at));

  if (next < 0) return html;

  return html.slice(0, next) + '<section id="why-jkglow" ' + html.slice(next + "<section".length);
}

let updated = 0;

for (const file of walk(root).sort()) {
  const rel = relative(root, file).split(sep).join("/");
  const lang = rel.startsWith("fr/") ? "fr" : "en";
  const before = readFileSync(file, "utf8");

  let html = before;

  html = navTargets(html);
  html = ariaCurrent(html, rel);
  html = categoryPictograms(html, lang);
  html = ctaTargets(html);
  html = formBrandOption(html, lang);
  html = contactDetails(html, lang);
  html = talkCard(html, lang);
  html = brandSection(html, lang);
  html = whyAnchor(html);
  html = brandCtaTargets(html);
  html = aboutPhotoSlot(html, lang);

  if (html === before) {
    console.log(`  ==  ${rel}`);
    continue;
  }

  updated++;

  if (!DRY) writeFileSync(file, html, "utf8");

  console.log(`  ${DRY ? "~~ " : "-> "} ${rel}`);
}

console.log(`\n${updated} page(s) ${DRY ? "would change" : "updated"}`);
