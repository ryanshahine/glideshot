// Tells search engines that support IndexNow (Bing, Yandex, Seznam, Naver, …) about every page in the
// sitemap, so new and changed pages get crawled quickly. Runs after `npm run deploy`.
// The key is public by design: the engines check it against public/<key>.txt on the site.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "glideshot.xyz";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = readdirSync(path.join(root, "public")).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("No IndexNow key file in public/");
const key = keyFile.replace(".txt", "");
const urlList = [...readFileSync(path.join(root, "dist/sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} (${urlList.length} URLs)`);
if (!res.ok) process.exitCode = 1;
