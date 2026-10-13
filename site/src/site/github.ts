// Stars and forks of the GitHub repo, fetched in the visitor's browser.
// Unauthenticated GitHub API calls are rate limited per visitor (60/hour), so results are cached for an
// hour, and failures (offline, rate limited) keep the numbers from build time.
import { SITE } from "./config";

export type RepoStats = { stars: number; forks: number };

/** The numbers at build time: shown immediately (and in the pre-rendered HTML), then refreshed live. */
export const BUILD_STATS: RepoStats | null = __GITHUB_STATS__;

const KEY = `github:${SITE.repo}`;
const FRESH_MS = 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;

let pending: Promise<RepoStats | null> | null = null;

export function loadRepoStats(): Promise<RepoStats | null> {
  return (pending ??= fetchStats());
}

async function fetchStats(): Promise<RepoStats | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < (cached.stats ? FRESH_MS : RETRY_MS)) return cached.stats;
  try {
    const res = await fetch(`https://api.github.com/repos/${SITE.repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const stats = { stars: Number(data.stargazers_count) || 0, forks: Number(data.forks_count) || 0 };
    writeCache(stats);
    return stats;
  } catch {
    // Keep showing the last known numbers if we have them; otherwise wait a bit before asking again.
    if (cached?.stats) return cached.stats;
    writeCache(null);
    return null;
  }
}

function readCache(): { at: number; stats: RepoStats | null } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(stats: RepoStats | null) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), stats }));
  } catch {
    // Storage blocked (private mode): fine, we'll just fetch again next time.
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
