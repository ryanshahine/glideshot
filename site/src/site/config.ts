// Everything the pages say about the site in one place (URLs, names, the download).

export const SITE = {
  name: "Glideshot",
  url: "https://glideshot.xyz",
  title: "Glideshot — Screen recordings, shot like film",
  description:
    "A Mac screen recorder with a virtual camera that tilts, zooms and follows your cursor. You can change the angle, focus and blur after recording.",
  /** Short line used where the long description doesn't fit (feeds, structured data). */
  tagline: "Screen recordings, shot like film.",
  repo: "ryanshahine/glideshot",
  repoUrl: "https://github.com/ryanshahine/glideshot",
  author: { name: "Ryan Shahine", url: "https://ryanshahine.me" },
  /** Social preview image (1200×630), relative to the site root. */
  ogImage: "/og.jpg",
  requirements: "macOS 14 or later on Apple silicon",
  /**
   * The app comes from the latest GitHub release, so the site never has to ship the binary.
   * Override with VITE_DOWNLOAD_URL (e.g. a local file while testing).
   */
  downloadUrl:
    (import.meta.env.VITE_DOWNLOAD_URL as string | undefined) ||
    "https://github.com/ryanshahine/glideshot/releases/latest/download/Glideshot.zip",
} as const;

export const absoluteUrl = (path: string) => SITE.url + path;
