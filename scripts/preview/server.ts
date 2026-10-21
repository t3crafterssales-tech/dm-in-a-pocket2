// A browser preview of the program's screens, for building and checking the look without
// Electron. Runs the real back end in Node and the real renderer in any browser.
//   node scripts/preview/server.ts [folder] [port]
// Then open http://localhost:<port>. Pickers (pictures, files) are not available in the preview.

import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { Backend, BACKEND_METHODS } from "../../src/app/backend.ts";
import type { BackendEvent } from "../../src/app/backend.ts";

const folder = process.argv[2] ?? join(tmpdir(), "dmip-preview");
const port = Number(process.argv[3] ?? 5173);
mkdirSync(folder, { recursive: true });
const out = join(tmpdir(), "dmip-preview-build");
mkdirSync(out, { recursive: true });

async function bundle() {
  await build({ entryPoints: ["src/ui/renderer.ts"], outfile: join(out, "renderer.js"), bundle: true, platform: "browser", format: "iife", target: "chrome130", logLevel: "warning" });
}
await bundle();

const listeners = new Set<(e: BackendEvent) => void>();
const backend = new Backend({
  settingsPath: join(folder, "settings.json"),
  defaultFolder: join(folder, "DM in a Pocket"),
  machine: "preview",
  emit: (e) => listeners.forEach((fn) => fn(e)),
  pickPicture: async () => null,
  pickFolder: async () => null,
});

const shim = `<script>
window.dmPicBase = "/pic/";
window.dm = {
  call: (method, args) => fetch("/call", { method: "POST", body: JSON.stringify({ method, args }) }).then(r => r.json()),
  showFolder: async () => "", bookPdf: async () => ({ ok: false, message: "Not in the preview." }),
  bookPrint: async () => ({ ok: false, message: "Not in the preview." }), openPdf: async () => "",
  onEvent: (fn) => { const es = new EventSource("/events"); es.onmessage = (m) => fn(JSON.parse(m.data)); },
};
</script>`;

const MIME: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/call" && req.method === "POST") {
    let body = "";
    for await (const c of req) body += c;
    const { method, args } = JSON.parse(body) as { method: string; args: unknown[] };
    res.setHeader("content-type", "application/json");
    if (!(BACKEND_METHODS as readonly string[]).includes(method)) return res.end(JSON.stringify({ ok: false, message: "Unknown request." }));
    try {
      const fn = (backend as unknown as Record<string, (...a: unknown[]) => unknown>)[method]!;
      res.end(JSON.stringify({ ok: true, value: (await fn.apply(backend, args)) ?? null }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }
  if (url.pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const fn = (e: BackendEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    listeners.add(fn);
    req.on("close", () => listeners.delete(fn));
    return;
  }
  if (url.pathname.startsWith("/pic/")) {
    const bytes = backend.picture(decodeURIComponent(url.pathname.slice(5)));
    if (!bytes) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", MIME[extname(url.pathname).toLowerCase()] ?? "application/octet-stream");
    return res.end(bytes);
  }
  if (url.pathname === "/rebuild") { await bundle(); return res.end("ok"); }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    let html = readFileSync("src/ui/index.html", "utf8").replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "").replace('<script src="renderer.js"></script>', shim + '<script src="renderer.js"></script>');
    res.setHeader("content-type", "text/html");
    return res.end(html);
  }
  const file = url.pathname === "/renderer.js" ? join(out, "renderer.js") : join("src/ui", url.pathname.replace(/^\/+/, ""));
  if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Preview: http://localhost:${port}  (data in ${folder})`));
