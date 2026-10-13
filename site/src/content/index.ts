// All blog articles, in the order the blog lists them (newest first; same-day posts keep this order).
// To add one: create a file in ./articles exporting `article`, then add it here.
import { article as autoZoom } from "./articles/auto-zoom-screen-recording";
import { article as cinematic } from "./articles/cinematic-screen-recordings-mac";
import { article as notarized } from "./articles/open-apps-not-notarized-macos";
import { article as exportSettings } from "./articles/screen-recording-export-settings";
import { article as screenStudio } from "./articles/screen-studio-alternative";
import type { Article } from "./ui";

export const ARTICLES: Article[] = [cinematic, autoZoom, exportSettings, screenStudio, notarized].sort((a, b) =>
  b.published.localeCompare(a.published),
);

export const articlePath = (a: Article) => `/blog/${a.slug}/`;
