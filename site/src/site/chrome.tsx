// Header, footer and small pieces shared by the home page (React app) and the static pages (blog, install).
import { useEffect, useState } from "react";
import { SITE } from "./config";
import { BUILD_STATS, formatCount, githubLabel, loadRepoStats, type RepoStats } from "./github";

export function Logo({ size = 22 }: { size?: number }) {
  // The app icon has a transparent margin (macOS grid), so draw it a bit larger to match the type.
  return <img src="/icon-128.png" width={size * 1.25} height={size * 1.25} alt="" className="-m-[3px] inline-block" />;
}

type Section = "blog" | "install";

export function SiteHeader({ stats = BUILD_STATS, current, sticky = false }: { stats?: RepoStats | null; current?: Section; sticky?: boolean }) {
  const link = (section: Section) =>
    `transition-colors ${current === section ? "text-ink" : "text-ink-80 hover:text-ink"}`;
  return (
    <header
      className={
        sticky
          ? "sticky top-0 z-20 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl backdrop-saturate-150"
          : "shrink-0"
      }
    >
      <div className="mx-auto flex h-[52px] w-full max-w-[1200px] items-center justify-between gap-4 px-5">
        <a href="/" className="flex items-center gap-2 text-[19px] font-semibold tracking-[-0.02em]">
          <Logo size={24} />
          Glideshot
        </a>
        <nav aria-label="Main" className="flex items-center gap-5 caption">
          <a href="/blog/" className={link("blog")} aria-current={current === "blog" ? "page" : undefined}>
            Blog
          </a>
          <a href="/install/" className={`max-[420px]:hidden ${link("install")}`} aria-current={current === "install" ? "page" : undefined}>
            Install guide
          </a>
          <GitHubButton stats={stats} />
        </nav>
      </div>
    </header>
  );
}

/**
 * Link to the repo with its stars and forks. Pre-rendered with the numbers from build time, then refreshed
 * live: by React on the home page and by `fillGitHubButtons` (github.ts) on the static pages.
 */
export function GitHubButton({ stats }: { stats: RepoStats | null }) {
  return (
    <a
      href={SITE.repoUrl}
      data-github-stats=""
      aria-label={githubLabel(stats)}
      className="press flex items-center gap-[7px] rounded-full border border-hairline px-3 py-[5px] text-ink transition-colors hover:border-ink-48"
    >
      <GitHubMark />
      <span data-gh="label" className={stats ? "hidden" : ""}>
        GitHub
      </span>
      <span data-gh="counts" className={`${stats ? "flex" : "hidden"} items-center gap-[10px] tabular-nums`}>
        <span className="flex items-center gap-1" title="Stars">
          <StarIcon />
          <span data-gh="stars">{stats ? formatCount(stats.stars) : ""}</span>
        </span>
        <span className="flex items-center gap-1" title="Forks">
          <ForkIcon />
          <span data-gh="forks">{stats ? formatCount(stats.forks) : ""}</span>
        </span>
      </span>
    </a>
  );
}

export function useRepoStats() {
  const [stats, setStats] = useState<RepoStats | null>(BUILD_STATS);
  useEffect(() => {
    let alive = true;
    loadRepoStats().then((s) => alive && s && setStats(s));
    return () => {
      alive = false;
    };
  }, []);
  return stats;
}

export function AuthorCredit({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      Built by{" "}
      <a
        href={SITE.author.url}
        target="_blank"
        rel="noopener"
        className="text-ink-80 underline-offset-2 hover:text-ink hover:underline"
      >
        {SITE.author.name}
      </a>
    </span>
  );
}

export function DownloadButton({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href={SITE.downloadUrl}
      onClick={onClick}
      className={`press inline-block rounded-full bg-primary px-[22px] py-[11px] text-[17px] text-white transition-colors hover:bg-primary-focus ${className}`}
    >
      Download for Mac
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-black/[0.06] bg-parchment">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-5 py-10 caption text-ink-48 sm:grid-cols-[1fr_auto]">
        <div>
          <a href="/" className="flex items-center gap-2 font-semibold text-ink">
            <Logo size={18} />
            Glideshot
          </a>
          <p className="mt-2 max-w-[420px]">
            A free, open-source screen recorder for {SITE.requirements}. <AuthorCredit />.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
          <a href={SITE.downloadUrl} className="hover:text-ink">Download</a>
          <a href="/install/" className="hover:text-ink">Install guide</a>
          <a href="/blog/" className="hover:text-ink">Blog</a>
          <a href={SITE.repoUrl} className="hover:text-ink">GitHub</a>
          <a href="/blog/rss.xml" className="hover:text-ink">RSS</a>
        </nav>
      </div>
    </footer>
  );
}

function GitHubMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="text-ink-48">
      <path d="M8 .25a.75.75 0 0 1 .67.42l1.89 3.81 4.2.61a.75.75 0 0 1 .42 1.28l-3.05 2.97.72 4.19a.75.75 0 0 1-1.09.79L8 12.35l-3.77 1.98a.75.75 0 0 1-1.09-.79l.72-4.19L.82 6.37a.75.75 0 0 1 .42-1.28l4.2-.61L7.33.67A.75.75 0 0 1 8 .25Z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="text-ink-48">
      <path d="M5 5.37v.88c0 .41.34.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.88a2.25 2.25 0 1 1 1.5 0v.88a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.13a2.25 2.25 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.88a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
    </svg>
  );
}
