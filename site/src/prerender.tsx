// Build-time rendering: every page as static HTML with its SEO tags, plus sitemap, RSS, robots.txt and llms.txt.
// Used by scripts/prerender.mjs after `vite build`, and by the dev server (vite.config.ts) so dev matches production.
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import App from "./App";
import { articlePath, ARTICLES } from "./content";
import { INSTALL, INSTALL_STEPS } from "./content/install";
import type { Article } from "./content/ui";
import { ArticlePage, BLOG, BlogIndexPage, InstallPage, NotFoundPage } from "./pages/pages";
import { absoluteUrl, SITE } from "./site/config";

export type OutputFile = {
  /** URL path: "/blog/x/" is written as blog/x/index.html, "/404" as 404.html, anything else as-is. */
  path: string;
  type: string;
  body: string;
};

type Meta = {
  path: string;
  title: string;
  description: string;
  type?: "website" | "article";
  published?: string;
  modified?: string;
  noindex?: boolean;
  jsonLd?: object[];
};

const AUTHOR = { "@type": "Person", name: SITE.author.name, url: SITE.author.url };
const PUBLISHER = {
  "@type": "Organization",
  name: SITE.name,
  url: absoluteUrl("/"),
  logo: { "@type": "ImageObject", url: absoluteUrl("/icon-512.png"), width: 512, height: 512 },
};
const OG_IMAGE_ALT = "Glideshot: a Mac screen, tilted in 3D with shallow depth of field, filmed by a virtual camera.";

/** "Title — Glideshot", unless the title already names the product. */
const pageTitle = (title: string) => (title.includes(SITE.name) ? title : `${title} — ${SITE.name}`);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const jsonLd = (data: object) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const isoTime = (date: string) => `${date}T00:00:00Z`;

function head(meta: Meta) {
  const url = absoluteUrl(meta.path);
  const image = absoluteUrl(SITE.ogImage);
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    meta.noindex
      ? `<meta name="robots" content="noindex" />`
      : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="author" content="${esc(SITE.author.name)}" />`,
    `<meta property="og:type" content="${meta.type ?? "website"}" />`,
    `<meta property="og:site_name" content="${SITE.name}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${esc(OG_IMAGE_ALT)}" />`,
  ];
  if (meta.published) tags.push(`<meta property="article:published_time" content="${isoTime(meta.published)}" />`);
  if (meta.modified) tags.push(`<meta property="article:modified_time" content="${isoTime(meta.modified)}" />`);
  if (meta.type === "article") tags.push(`<meta property="article:author" content="${SITE.author.url}" />`);
  tags.push(
    `<meta name="theme-color" content="#ffffff" />`,
    `<link rel="icon" href="/favicon.ico" sizes="48x48" />`,
    `<link rel="icon" href="/favicon-96.png" sizes="96x96" type="image/png" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/site.webmanifest" />`,
    `<link rel="alternate" type="application/rss+xml" title="${SITE.name} blog" href="${absoluteUrl("/blog/rss.xml")}" />`,
  );
  if (meta.jsonLd?.length) tags.push(jsonLd({ "@context": "https://schema.org", "@graph": meta.jsonLd }));
  return tags.join("\n    ");
}

function htmlDocument(meta: Meta, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${head(meta)}
    <!--assets-->
  </head>
  <body>
    ${body}
  </body>
</html>
`;
}

const breadcrumbs = (items: [name: string, path: string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: absoluteUrl(path) })),
});

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const latest = (dates: string[]) => dates.sort().at(-1)!;
const lastModified = (a: Article) => a.updated ?? a.published;

// ---- Pages

const HOME_META: Meta = {
  path: "/",
  title: SITE.title,
  description: SITE.description,
  jsonLd: [
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      description: SITE.description,
      url: absoluteUrl("/"),
      applicationCategory: "MultimediaApplication",
      operatingSystem: "macOS 14 or later",
      softwareRequirements: "Mac with Apple silicon",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      isAccessibleForFree: true,
      downloadUrl: SITE.downloadUrl,
      installUrl: absoluteUrl(INSTALL.path),
      license: "https://opensource.org/licenses/MIT",
      image: absoluteUrl("/icon-512.png"),
      screenshot: absoluteUrl(SITE.ogImage),
      sameAs: [SITE.repoUrl],
      author: AUTHOR,
    },
    { "@type": "WebSite", name: SITE.name, url: absoluteUrl("/"), description: SITE.description, publisher: PUBLISHER },
  ],
};

function articleFile(article: Article): OutputFile {
  const words = textOf(renderToStaticMarkup(<>{article.body()}</>)).split(" ").length;
  const minutes = Math.max(1, Math.round(words / 230));
  const path = articlePath(article);
  const meta: Meta = {
    path,
    title: pageTitle(article.metaTitle ?? article.title),
    description: article.description,
    type: "article",
    published: article.published,
    modified: lastModified(article),
    jsonLd: [
      {
        "@type": "BlogPosting",
        headline: article.title,
        description: article.description,
        url: absoluteUrl(path),
        mainEntityOfPage: absoluteUrl(path),
        datePublished: isoTime(article.published),
        dateModified: isoTime(lastModified(article)),
        image: absoluteUrl(SITE.ogImage),
        wordCount: words,
        inLanguage: "en",
        author: AUTHOR,
        publisher: PUBLISHER,
      },
      breadcrumbs([["Home", "/"], ["Blog", BLOG.path], [article.title, path]]),
    ],
  };
  return { path, type: "text/html", body: htmlDocument(meta, renderToStaticMarkup(<ArticlePage article={article} readingMinutes={minutes} />)) };
}

function blogFile(): OutputFile {
  const meta: Meta = {
    path: BLOG.path,
    title: pageTitle(BLOG.metaTitle),
    description: BLOG.description,
    jsonLd: [
      {
        "@type": "Blog",
        name: `${SITE.name} blog`,
        url: absoluteUrl(BLOG.path),
        description: BLOG.description,
        publisher: PUBLISHER,
        blogPost: ARTICLES.map((a) => ({
          "@type": "BlogPosting",
          headline: a.title,
          url: absoluteUrl(articlePath(a)),
          datePublished: isoTime(a.published),
          author: AUTHOR,
        })),
      },
      breadcrumbs([["Home", "/"], ["Blog", BLOG.path]]),
    ],
  };
  return { path: BLOG.path, type: "text/html", body: htmlDocument(meta, renderToStaticMarkup(<BlogIndexPage />)) };
}

function installFile(): OutputFile {
  const meta: Meta = {
    path: INSTALL.path,
    title: pageTitle(INSTALL.metaTitle),
    description: INSTALL.description,
    published: INSTALL.published,
    jsonLd: [
      {
        "@type": "HowTo",
        name: INSTALL.title,
        description: INSTALL.description,
        url: absoluteUrl(INSTALL.path),
        totalTime: "PT2M",
        supply: [{ "@type": "HowToSupply", name: "A Mac with Apple silicon and macOS 14 or later" }],
        step: INSTALL_STEPS.map((step, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: step.name,
          text: textOf(renderToStaticMarkup(<>{step.body}</>)).replace(/\s*Download for Mac\s*$/, ""),
        })),
      },
      breadcrumbs([["Home", "/"], ["Install guide", INSTALL.path]]),
    ],
  };
  return { path: INSTALL.path, type: "text/html", body: htmlDocument(meta, renderToStaticMarkup(<InstallPage />)) };
}

function notFoundFile(): OutputFile {
  const meta: Meta = { path: "/404", title: pageTitle("Page not found"), description: SITE.description, noindex: true };
  return { path: "/404", type: "text/html", body: htmlDocument(meta, renderToStaticMarkup(<NotFoundPage />)) };
}

// ---- Feeds and crawler files

const INDEXED_PAGES = (): { path: string; modified: string }[] => [
  { path: "/", modified: latest([INSTALL.published, ...ARTICLES.map(lastModified)]) },
  { path: INSTALL.path, modified: INSTALL.published },
  { path: BLOG.path, modified: latest(ARTICLES.map(lastModified)) },
  ...ARTICLES.map((a) => ({ path: articlePath(a), modified: lastModified(a) })),
];

function sitemap(): OutputFile {
  const urls = INDEXED_PAGES()
    .map((p) => `  <url>\n    <loc>${absoluteUrl(p.path)}</loc>\n    <lastmod>${p.modified}</lastmod>\n  </url>`)
    .join("\n");
  return {
    path: "/sitemap.xml",
    type: "application/xml",
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  };
}

function rss(): OutputFile {
  const rfc822 = (date: string) => new Date(isoTime(date)).toUTCString();
  const items = ARTICLES.map(
    (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${absoluteUrl(articlePath(a))}</link>
      <guid isPermaLink="true">${absoluteUrl(articlePath(a))}</guid>
      <pubDate>${rfc822(a.published)}</pubDate>
      <dc:creator>${esc(SITE.author.name)}</dc:creator>
      <description>${esc(a.description)}</description>
    </item>`,
  ).join("\n");
  return {
    path: "/blog/rss.xml",
    type: "application/rss+xml",
    body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${SITE.name} blog</title>
    <link>${absoluteUrl(BLOG.path)}</link>
    <description>${esc(BLOG.description)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(latest(ARTICLES.map(lastModified)))}</lastBuildDate>
    <atom:link href="${absoluteUrl("/blog/rss.xml")}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`,
  };
}

function robots(): OutputFile {
  return {
    path: "/robots.txt",
    type: "text/plain",
    body: `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`,
  };
}

/** A plain-text summary for AI assistants (llmstxt.org). */
function llms(): OutputFile {
  const articles = ARTICLES.map((a) => `- [${a.title}](${absoluteUrl(articlePath(a))}): ${a.description}`).join("\n");
  return {
    path: "/llms.txt",
    type: "text/plain",
    body: `# ${SITE.name}

> ${SITE.description}

Glideshot is a free, open-source (MIT) screen recorder for ${SITE.requirements}. It records the raw screen plus
mouse and keyboard activity, then films it with a virtual camera: the screen is tilted in 3D, zoomed in, and
blurred away from the action (depth of field). The camera follows the cursor or stays locked, zooms in on clicks
and typing, and every behavior can be switched off. The look can be changed after recording, and one take can be
exported as 16:9, 16:10, 4:3, 1:1, 4:5 and 9:16 (1080p, 1440p or 4K; 30 or 60 fps; H.264 or HEVC). It has no
audio recording yet. It is not notarized, so macOS asks for confirmation on first launch (see the install guide).
Built by ${SITE.author.name} (${SITE.author.url}).

## Docs

- [Install guide](${absoluteUrl(INSTALL.path)}): ${INSTALL.description}
- [Source code on GitHub](${SITE.repoUrl}): Swift (ScreenCaptureKit, Core Image, AVFoundation); build with ./build.sh.

## Blog

${articles}
`,
  };
}

// ---- Entry points

/** Everything except the home page, which Vite builds from index.html (see `fillHome`). */
export function files(): OutputFile[] {
  return [blogFile(), ...ARTICLES.map(articleFile), installFile(), notFoundFile(), sitemap(), rss(), robots(), llms()];
}

export function fileFor(path: string): OutputFile | undefined {
  return files().find((f) => f.path === path);
}

/** Puts the home page's SEO tags and its pre-rendered markup into index.html. */
export function fillHome(template: string) {
  return template.replace("<!--head-->", head(HOME_META)).replace("<!--app-->", renderToString(<App />));
}
