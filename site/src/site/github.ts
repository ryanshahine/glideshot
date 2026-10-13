// Stars and forks of the GitHub repo, fetched in the visitor's browser on every page view.
// GitHub's API answers with a one-minute cache header and an ETag, so the browser's own HTTP cache keeps
// repeat views cheap. The last numbers are also kept in localStorage, to show right away on the next
// visit and as a fallback when GitHub can't be reached (offline, rate limited).
import { SITE } from "./config";

export type RepoStats = { stars: number; forks: number };

/** The numbers at build time: shown immediately (and in the pre-rendered HTML), then refreshed live. */
export const BUILD_STATS: RepoStats | null = __GITHUB_STATS__;

const KEY = `github-stats:${SITE.repo}`;

let pending: Promise<RepoStats | null> | null = null;

/** The current numbers from GitHub, or the last ones this browser saw if GitHub can't be reached. */
export function loadRepoStats(): Promise<RepoStats | null> {
  return (pending ??= fetchStats());
}

async function fetchStats(): Promise<RepoStats | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${SITE.repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const stats = { stars: Number(data.stargazers_count) || 0, forks: Number(data.forks_count) || 0 };
    try {
      localStorage.setItem(KEY, JSON.stringify(stats));
    } catch {
      // Storage blocked (private mode): fine, nothing to remember.
    }
    return stats;
  } catch {
    return cachedRepoStats();
  }
}

/** The last numbers this browser saw, or null. */
export function cachedRepoStats(): RepoStats | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return typeof saved?.stars === "number" && typeof saved?.forks === "number" ? saved : null;
  } catch {
    return null;
  }
}

/** 950 → "950", 1234 → "1.2k", 12345 → "12k" */
export function formatCount(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k).toString()) + "k";
}

export const githubLabel = (stats: RepoStats | null) =>
  stats ? `Glideshot on GitHub: ${stats.stars} stars, ${stats.forks} forks` : "Glideshot on GitHub";

/** Static pages: put the numbers into the server-rendered GitHub buttons. */
export function fillGitHubButtons(stats: RepoStats) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-github-stats]")) {
    el.querySelector('[data-gh="stars"]')!.textContent = formatCount(stats.stars);
    el.querySelector('[data-gh="forks"]')!.textContent = formatCount(stats.forks);
    el.querySelector('[data-gh="label"]')!.classList.add("hidden");
    el.querySelector('[data-gh="counts"]')!.classList.replace("hidden", "flex");
    el.setAttribute("aria-label", githubLabel(stats));
  }
}
