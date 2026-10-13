/// <reference types="vite/client" />

/** Stars and forks fetched when the site was built (see vite.config.ts); null if GitHub couldn't be reached. */
declare const __GITHUB_STATS__: { stars: number; forks: number } | null;
