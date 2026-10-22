// The table's door for players (version 2.5): a small web server inside the DM's app, on the home
// network. Players open its address (or scan the QR code) in any browser, type their PIN, and get
// their own screen. Built on Node's own http module; nothing to install.
//
//   GET  /            the player page          GET /player.js, /player.css
//   POST /join        { pin } → who you are     (five wrong PINs from one device: a five-minute wait)
//   GET  /state?pin=  your screen as data
//   GET  /events?pin= a live stream: "changed" whenever anything at the table changes
//   POST /act?pin=    { action } something you did (chat, roll, End my turn...)
//   GET  /pic/<id>?pin= a picture
//
// The server knows nothing about the game: the back end answers through the host functions, and
// every action is checked against the person's permissions there.

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import type { Id } from "../engine/index.ts";

export interface LanHost {
  /** Who a PIN belongs to, or null. */
  who: (pin: string) => { id: Id; name: string } | null;
  state: (personId: Id) => unknown;
  act: (personId: Id, action: unknown) => unknown;
  picture: (id: string) => Buffer | null;
  /** The player page's files: "player.html", "player.js", "player.css". */
  file: (name: string) => Buffer | string | null;
  /** Someone joined or left (for the green dots). */
  presence: (online: Id[]) => void;
}

const MIME: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const MAX_BODY = 64 * 1024;
const MAX_TRIES = 5;
const WAIT_MS = 5 * 60 * 1000;

export const DEFAULT_PORT = 7310;

/** The computer's addresses on the home network (Wi-Fi or cable), best first. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) out.push(a.address);
  // Home networks usually use 192.168.x.x; put those first.
  return out.sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));
}

export class LanServer {
  private server: Server | null = null;
  private readonly streams = new Map<Id, Set<ServerResponse>>();
  private readonly tries = new Map<string, { count: number; until: number }>();
  private pending: ReturnType<typeof setTimeout> | null = null;
  private readonly host: LanHost;
  private readonly now: () => number;
  port = 0;

  constructor(host: LanHost, now: () => number = () => Date.now()) {
    this.host = host;
    this.now = now;
  }

  get running(): boolean {
    return !!this.server;
  }

  /** Who is connected right now. */
  online(): Id[] {
    return [...this.streams].filter(([, s]) => s.size).map(([id]) => id);
  }

  /** Opens the door. Tries the usual port and the next few if something else is using it. */
  async start(port = DEFAULT_PORT, bind = "0.0.0.0"): Promise<number> {
    if (this.server) return this.port;
    for (let p = port, tries = 0; ; p++, tries++) {
      const server = createServer((req, res) => void this.handle(req, res));
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(p, bind, () => resolve());
        });
        this.server = server;
        const addr = server.address();
        this.port = typeof addr === "object" && addr ? addr.port : p;
        return this.port;
      } catch (e) {
        server.close();
        if (port === 0 || tries >= 10 || (e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
      }
    }
  }

  /** Closes the door; everyone's screen says the table closed. */
  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    for (const set of this.streams.values()) for (const res of set) res.end("event: closed\ndata: {}\n\n");
    this.streams.clear();
    this.host.presence([]);
    if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  /** Something changed at the table: every screen fetches its new state (at most ten times a second). */
  changed(): void {
    if (!this.server || this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      for (const set of this.streams.values()) for (const res of set) res.write("data: changed\n\n");
    }, 100);
  }

  /** A short-lived signal to some screens (a pointer pulse): not saved anywhere. */
  signal(event: string, data: unknown, to: Id[] | null = null): void {
    for (const [id, set] of this.streams) if (!to || !to.length || to.includes(id)) for (const res of set) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  /** Ends one person's screens (their PIN was re-rolled or revoked). */
  kick(id: Id): void {
    const set = this.streams.get(id);
    if (!set) return;
    for (const res of set) res.end("event: closed\ndata: {}\n\n");
    this.streams.delete(id);
    this.host.presence(this.online());
  }

  private ip(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? "?";
  }

  private send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }

  private async body(req: IncomingMessage): Promise<unknown> {
    let text = "";
    for await (const c of req) {
      text += c;
      if (text.length > MAX_BODY) throw new Error("Too much at once.");
    }
    return text ? JSON.parse(text) : {};
  }

  /** The person a request's PIN belongs to, counting wrong guesses per device. */
  private person(req: IncomingMessage, pin: string | null): { id: Id; name: string } | "locked" | null {
    const ip = this.ip(req);
    const t = this.tries.get(ip);
    if (t && t.count >= MAX_TRIES && t.until > this.now()) return "locked";
    const p = pin ? this.host.who(pin) : null;
    if (p) {
      this.tries.delete(ip);
      return p;
    }
    const count = (t && t.until > this.now() ? t.count : 0) + 1;
    this.tries.set(ip, { count, until: this.now() + WAIT_MS });
    return null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const url = new URL(req.url ?? "/", "http://table");
      const path = url.pathname;
      if (req.method === "GET" && (path === "/" || path === "/index.html")) return this.file(res, "player.html");
      if (req.method === "GET" && (path === "/player.js" || path === "/player.css")) return this.file(res, path.slice(1));
      if (path === "/join" && req.method === "POST") {
        const b = (await this.body(req)) as { pin?: unknown };
        const p = this.person(req, typeof b.pin === "string" ? b.pin : null);
        if (p === "locked") return this.send(res, 429, { ok: false, message: "Too many wrong PINs. Wait five minutes, then try again." });
        if (!p) return this.send(res, 403, { ok: false, message: "That PIN isn't right. Ask the DM for yours." });
        return this.send(res, 200, { ok: true, name: p.name });
      }
      // Everything else needs a PIN.
      const p = this.person(req, url.searchParams.get("pin"));
      if (p === "locked") return this.send(res, 429, { ok: false, message: "Too many wrong PINs. Wait five minutes." });
      if (!p) return this.send(res, 403, { ok: false, message: "Your PIN doesn't work any more. Ask the DM." });
      if (path === "/state" && req.method === "GET") return this.send(res, 200, { ok: true, value: this.host.state(p.id) });
      if (path === "/events" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write("retry: 2000\n\n");
        const set = this.streams.get(p.id) ?? new Set();
        set.add(res);
        this.streams.set(p.id, set);
        this.host.presence(this.online());
        const ping = setInterval(() => res.write(": still here\n\n"), 25000);
        req.on("close", () => {
          clearInterval(ping);
          set.delete(res);
          this.host.presence(this.online());
        });
        return;
      }
      if (path === "/act" && req.method === "POST") {
        const b = (await this.body(req)) as { action?: unknown };
        try {
          const value = this.host.act(p.id, b.action);
          return this.send(res, 200, { ok: true, value: value ?? null });
        } catch (e) {
          return this.send(res, 200, { ok: false, message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (path.startsWith("/pic/") && req.method === "GET") {
        const id = decodeURIComponent(path.slice(5));
        const bytes = /^[\w.-]+$/.test(id) ? this.host.picture(id) : null;
        if (!bytes) return this.send(res, 404, { ok: false });
        const ext = id.slice(id.lastIndexOf(".")).toLowerCase();
        res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "private, max-age=3600" });
        return res.end(bytes);
      }
      this.send(res, 404, { ok: false, message: "Nothing here." });
    } catch (e) {
      if (!res.headersSent) this.send(res, 400, { ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  private file(res: ServerResponse, name: string) {
    const f = this.host.file(name);
    if (f === null) return this.send(res, 404, { ok: false, message: "The player page is missing from this build." });
    res.writeHead(200, { "content-type": MIME[name.slice(name.lastIndexOf("."))] ?? "text/plain", "cache-control": "no-cache" });
    res.end(f);
  }
}
