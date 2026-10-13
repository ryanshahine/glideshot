import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const REPO = "ryanshahine/glideshot";

export default defineConfig(async ({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), staticPages()],
  // Baked into the pages so the numbers are there on first paint; the browser refreshes them live.
  define: { __GITHUB_STATS__: JSON.stringify(await fetchRepoStats()) },
  build: isSsrBuild
    ? {}
    : {
        manifest: true, // scripts/prerender.mjs reads it to link the static pages' CSS and script
        rollupOptions: { input: { main: "index.html", static: "src/static.ts" } },
      },
}));

/** Stars and forks right now. A repo that isn't public yet counts as 0; null if GitHub can't be reached. */
async function fetchRepoStats(): Promise<{ stars: number; forks: number } | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers, signal: AbortSignal.timeout(5000) });
    if (res.status === 404) return { stars: 0, forks: 0 };
    if (!res.ok) return null;
    const data = await res.json();
    return { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Dev server: serves the pre-rendered pages (home, blog, install guide, sitemap…) straight from
 * src/prerender.tsx, so `npm run dev` shows exactly what `npm run build` writes.
 */
function staticPages(): Plugin {
  return {
    name: "glideshot-static-pages",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost").pathname;
        const ext = path.extname(url);
        if (url.startsWith("/@") || url.startsWith("/src/") || url.startsWith("/node_modules/")) return next();
        if (ext && ![".html", ".xml", ".txt"].includes(ext)) return next();
        try {
          const prerender = await server.ssrLoadModule("/src/prerender.tsx");
          if (url === "/" || url === "/index.html") {
            const template = readFileSync(path.resolve(server.config.root, "index.html"), "utf8");
            return send(res, 200, "text/html", await server.transformIndexHtml(url, prerender.fillHome(template)));
          }
          let file = prerender.fileFor(url);
          if (!file && !ext && prerender.fileFor(`${url}/`)) {
            res.writeHead(308, { Location: `${url}/` });
            return res.end();
          }
          const status = file ? 200 : ext ? 0 : 404;
          if (!status) return next();
          file ??= prerender.fileFor("/404");
          let body: string = file.body;
          if (file.type === "text/html") {
            body = body.replace(
              "<!--assets-->",
              '<link rel="stylesheet" href="/src/index.css" />\n    <script type="module" src="/src/static.ts"></script>',
            );
            body = await server.transformIndexHtml(url, body);
          }
          send(res, status, file.type, body);
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          next(error);
        }
      });
    },
  };
}

function send(res: import("node:http").ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
  res.end(body);
}
