# glideshot.xyz

The Glideshot website: React + Vite + Tailwind CSS v4, with Apple-style design tokens (Inter instead of SF Pro).

```bash
npm install
npm run dev      # http://localhost:5173, pages are rendered exactly like the production build
npm run build    # static site in dist/, ready for any static host (Cloudflare Pages, Netlify, …)
```

## Pages

- **Home** (`src/App.tsx`): one screen, no scrolling. Headline and Download on top, the live demo fills the rest,
  with the preset looks and an Adjust panel below.
- **Blog** (`src/content/articles/`) and the **install guide** (`src/content/install.tsx`): plain static HTML, no
  React in the browser. To add a post, add a file to `src/content/articles/` and list it in `src/content/index.ts`.

Everything is pre-rendered at build time by `src/prerender.tsx`, which also writes the SEO tags, structured data
(JSON-LD), `sitemap.xml`, `blog/rss.xml`, `robots.txt`, `llms.txt` and `404.html`. The home page is rendered too,
then hydrated by React. The dev server serves the same output (see the plugin in `vite.config.ts`).

Site-wide facts (URL, repo, author, download link) live in `src/site/config.ts`. The Download button points at the
latest GitHub release's `Glideshot.zip`; set `VITE_DOWNLOAD_URL` to override it. GitHub stars and forks are fetched
at build time (set `GITHUB_TOKEN` to avoid rate limits in CI) and refreshed in the browser.

## The demo

The demo isn't a video: `src/demo/` recreates Glideshot's look live.

- `screenPainter.ts` paints the fake Mac screen (1440×900) into a canvas, used as a texture.
- `script.ts` is the scripted take: mouse path, clicks and typing.
- `director.ts` is a port of the app's camera operator (springs, dead zone, look ahead, auto-zoom).
- `glRenderer.ts` films it in one WebGL2 pass: 3D projection, depth of field, motion blur, cursor, ripples.
  `TiltDemoDom.tsx` is a simpler fallback for browsers without WebGL2.
- `Controls.tsx` lists every app setting once; the desktop panel and the phone strip are both built from it.

`public/macos/` holds real macOS icons (file types, Apple's own apps for the Dock, Finder sidebar symbols)
exported by `scripts/export-macos-icons.swift`. Only Apple's own apps are used, so no third-party logos appear.
The app icon, favicons and logo come from `../scripts/make-icon.swift`.
