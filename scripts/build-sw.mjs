import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const html = await fs.readFile("dist/index.html", "utf8");
const version = createHash("sha256").update(html).digest("hex").slice(0, 12);
const files = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  ...Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"#]+)"/g), (m) => m[1]),
];
await fs.writeFile(
  "dist/sw.js",
  `const CACHE='photo-shell-${version}';const FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('photo-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/downloads/'))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return;}if(FILES.includes(u.pathname))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});`,
);
