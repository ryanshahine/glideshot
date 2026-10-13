// Runs after `vite build` (client) and `vite build --ssr src/prerender.tsx` (into .ssr/):
// writes every static page, feed and crawler file into dist/, and pre-renders the home page.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const { files, fillHome } = await import(pathToFileURL(path.join(root, ".ssr/prerender.js")).href);

const indexPath = path.join(dist, "index.html");
let index = readFileSync(indexPath, "utf8");

// Preload the Latin subset of Inter, so text doesn't visibly swap fonts after the first paint.
const manifest = JSON.parse(readFileSync(path.join(dist, ".vite/manifest.json"), "utf8"));
const font = Object.values(manifest)
  .flatMap((chunk) => chunk.assets ?? [])
  .concat(readdirSync(path.join(dist, "assets")).map((f) => `assets/${f}`))
  .find((file) => /inter-latin-wght-normal-[\w-]+\.woff2$/.test(file));
const fontPreload = font ? `<link rel="preload" href="/${font}" as="font" type="font/woff2" crossorigin />` : "";
if (fontPreload) index = index.replace("<!--head-->", `<!--head-->\n    ${fontPreload}`);

// Static pages share the home page's stylesheet (same file, so it's cached) and load src/static.ts.
const stylesheets = index.match(/<link rel="stylesheet"[^>]*>/g) ?? [];
const preload = new Set();
(function collect(key, isEntry) {
  const chunk = manifest[key];
  if (!isEntry) preload.add(chunk.file);
  for (const imported of chunk.imports ?? []) collect(imported, false);
})("src/static.ts", true);
const assets = [
  fontPreload,
  ...stylesheets,
  ...[...preload].map((file) => `<link rel="modulepreload" crossorigin href="/${file}" />`),
  `<script type="module" crossorigin src="/${manifest["src/static.ts"].file}"></script>`,
]
  .filter(Boolean)
  .join("\n    ");

for (const file of files()) {
  const out = file.path.endsWith("/")
    ? path.join(dist, file.path, "index.html")
    : path.join(dist, file.path === "/404" ? "404.html" : file.path);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, file.type === "text/html" ? file.body.replace("<!--assets-->", assets) : file.body);
  console.log(`  ${path.relative(dist, out)}`);
}

writeFileSync(indexPath, fillHome(index));
console.log("  index.html (pre-rendered)");

// The manifest and the SSR bundle were only needed for this step.
rmSync(path.join(dist, ".vite"), { recursive: true, force: true });
rmSync(path.join(root, ".ssr"), { recursive: true, force: true });
