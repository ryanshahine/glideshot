// The static pages (blog, articles, install guide, 404). Rendered to HTML at build time, no React in the browser.
import type { ReactNode } from "react";
import { articlePath, ARTICLES } from "../content";
import { InstallGuide, INSTALL } from "../content/install";
import type { Article } from "../content/ui";
import { DownloadButton, SiteFooter, SiteHeader } from "../site/chrome";
import { SITE } from "../site/config";

function Shell({ current, children }: { current?: "blog" | "install"; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader current={current} sticky />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export function ArticlePage({ article, readingMinutes }: { article: Article; readingMinutes: number }) {
  const others = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3);
  return (
    <Shell current="blog">
      <article className="mx-auto max-w-[720px] px-5 pt-[clamp(32px,6vw,64px)] pb-16">
        <nav aria-label="Breadcrumb" className="caption text-ink-48">
          <a href="/blog/" className="hover:text-ink">
            Blog
          </a>
        </nav>
        <h1 className="mt-3 display-lg text-balance">{article.title}</h1>
        <p className="mt-4 text-[21px] leading-[1.38] text-ink-48 text-pretty">{article.description}</p>
        <p className="mt-6 caption text-ink-48">
          By{" "}
          <a href={SITE.author.url} target="_blank" rel="author noopener" className="text-ink-80 hover:text-ink hover:underline">
            {SITE.author.name}
          </a>{" "}
          · <time dateTime={article.published}>{formatDate(article.published)}</time> · {readingMinutes} min read
        </p>
        <div className="article mt-10">{article.body()}</div>
        <CallToAction />
      </article>
      <MoreArticles articles={others} />
    </Shell>
  );
}

function CallToAction() {
  return (
    <aside className="mt-14 rounded-[18px] bg-parchment p-6 sm:p-8">
      <p className="flex items-center gap-2 font-semibold">
        <img src="/icon-128.png" width={30} height={30} alt="" className="-m-[3px]" />
        Glideshot
      </p>
      <p className="mt-2 text-ink-80">
        A free, open-source Mac screen recorder with a virtual camera that tilts, zooms and follows your cursor. Change
        the angle, focus and blur after recording.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <DownloadButton />
        <a href="/install/" className="text-primary hover:underline">
          How to install <span aria-hidden>›</span>
        </a>
      </div>
    </aside>
  );
}

function MoreArticles({ articles }: { articles: Article[] }) {
  if (!articles.length) return null;
  return (
    <section aria-labelledby="more" className="border-t border-black/[0.06]">
      <div className="mx-auto max-w-[1000px] px-5 py-14">
        <h2 id="more" className="tagline">
          More from the blog
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {articles.map((a) => (
            <li key={a.slug}>
              <ArticleCard article={a} compact />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ArticleCard({ article, compact = false }: { article: Article; compact?: boolean }) {
  return (
    <a
      href={articlePath(article)}
      className="group flex h-full flex-col rounded-[18px] border border-black/[0.06] bg-white p-6 transition-shadow hover:shadow-[0_6px_30px_rgba(0,0,0,.08)]"
    >
      <h3 className={`font-semibold text-balance group-hover:text-primary ${compact ? "text-[17px] leading-snug" : "text-[21px] leading-tight"}`}>
        {article.title}
      </h3>
      {!compact && <p className="mt-2 text-ink-80 text-pretty">{article.description}</p>}
      <p className="mt-auto pt-4 caption text-ink-48">
        <time dateTime={article.published}>{formatDate(article.published)}</time>
      </p>
    </a>
  );
}

export const BLOG = {
  path: "/blog/",
  title: "Blog",
  metaTitle: "Glideshot blog: better screen recordings on the Mac",
  description:
    "Guides on making screen recordings that look like film: camera movement, auto-zoom, depth of field, export settings, and installing Mac apps that aren't notarized.",
};

export function BlogIndexPage() {
  return (
    <Shell current="blog">
      <div className="mx-auto max-w-[1000px] px-5 pt-[clamp(32px,6vw,64px)] pb-20">
        <h1 className="display-lg">Blog</h1>
        <p className="mt-3 max-w-[620px] text-[21px] leading-[1.38] text-ink-48">
          Notes on making screen recordings that look like film, and on the camera inside Glideshot.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {ARTICLES.map((a) => (
            <li key={a.slug}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export function InstallPage() {
  return (
    <Shell current="install">
      <article className="mx-auto max-w-[720px] px-5 pt-[clamp(32px,6vw,64px)] pb-20">
        <h1 className="display-lg">{INSTALL.title}</h1>
        <div className="article mt-6">
          <InstallGuide />
        </div>
      </article>
    </Shell>
  );
}

export function NotFoundPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-[720px] px-5 py-24 text-center">
        <h1 className="display-lg">Page not found</h1>
        <p className="mt-4 text-[21px] text-ink-48">This page doesn't exist, or it moved.</p>
        <p className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <a href="/" className="text-primary hover:underline">
            Home <span aria-hidden>›</span>
          </a>
          <a href="/blog/" className="text-primary hover:underline">
            Blog <span aria-hidden>›</span>
          </a>
          <a href="/install/" className="text-primary hover:underline">
            Install guide <span aria-hidden>›</span>
          </a>
        </p>
      </div>
    </Shell>
  );
}
