// The Electron main process: one window, connected to the back end. Kept thin on purpose; the
// behaviour lives in backend.ts, which is tested without Electron.

import { BrowserWindow, Menu, app, dialog, ipcMain, protocol, shell } from "electron";
import { writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { extname, join } from "node:path";
import { Backend, BACKEND_METHODS, PICTURE_TYPES } from "./backend.ts";
import type { BackendEvent, BackendMethod, BookRequest } from "./backend.ts";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

// Pictures are shown through dmpic://pic/<id>, read straight from the picture store.
protocol.registerSchemesAsPrivileged([{ scheme: "dmpic", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// "One copy open at a time": a second start just brings the first window forward.
if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let backend: Backend | null = null;

function send(event: BackendEvent) {
  win?.webContents.send("dm:event", event);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "DM in a Pocket",
    backgroundColor: "#f6f1e7",
    icon: join(__dirname, "icon.png"),
    show: false,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once("ready-to-show", () => win?.show());
  // Links never open inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  void win.loadFile(join(__dirname, "index.html"));
  win.on("closed", () => (win = null));
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  backend = new Backend({
    settingsPath: join(app.getPath("userData"), "settings.json"),
    defaultFolder: join(app.getPath("documents"), "DM in a Pocket"),
    machine: hostname(),
    emit: send,
    pickPicture: async () => {
      const r = await dialog.showOpenDialog(win!, { title: "Choose a picture", properties: ["openFile"], filters: [{ name: "Pictures", extensions: PICTURE_TYPES.map((x) => x.slice(1)) }] });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    pickSave: async (defaultName, kind) => {
      const ext = kind === "world" ? "dmworld" : "dmsys";
      const r = await dialog.showSaveDialog(win!, { title: kind === "world" ? "Share this world" : "Share this system", defaultPath: join(app.getPath("documents"), defaultName), filters: [{ name: kind === "world" ? "DM in a Pocket world" : "DM in a Pocket system", extensions: [ext] }] });
      return r.canceled ? null : (r.filePath ?? null);
    },
    pickImport: async () => {
      const r = await dialog.showOpenDialog(win!, { title: "Import a world or system", properties: ["openFile"], filters: [{ name: "DM in a Pocket files", extensions: ["dmworld", "dmsys"] }] });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    pickWord: async (defaultName) => {
      const r = await dialog.showSaveDialog(win!, { title: "Save the rulebook as a Word file", defaultPath: join(app.getPath("documents"), defaultName), filters: [{ name: "Word document", extensions: ["docx"] }] });
      return r.canceled ? null : (r.filePath ?? null);
    },
    pickFolder: async () => {
      const r = await dialog.showOpenDialog(win!, { title: "Choose the main folder", properties: ["openDirectory", "createDirectory"] });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
  });

  protocol.handle("dmpic", (req) => {
    const id = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ""));
    const bytes = backend?.picture(id);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { "content-type": MIME[extname(id).toLowerCase()] ?? "application/octet-stream" } });
  });

  ipcMain.handle("dm:call", async (_e, method: BackendMethod, args: unknown[]) => {
    if (!backend || !(BACKEND_METHODS as readonly string[]).includes(method)) throw new Error("Unknown request.");
    const fn = backend[method] as (...a: unknown[]) => unknown;
    // Errors go back to the window as plain messages it can show.
    try {
      return { ok: true, value: await fn.apply(backend, args) };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle("dm:showFolder", () => (backend ? shell.openPath(backend.folder) : ""));

  // The rulebook: laid out in a hidden window by the same page as the preview, then saved as a
  // PDF or sent to the printer.
  const renderBook = async (opts: BookRequest) => {
    const data = backend!.book(opts);
    const w = new BrowserWindow({ show: false, width: 1000, height: 1300, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    await w.loadFile(join(__dirname, "book.html"));
    await w.webContents.executeJavaScript(`window.renderBook(${JSON.stringify(data)})`);
    return { w, data };
  };
  ipcMain.handle("dm:bookPdf", async (_e, opts: BookRequest) => {
    try {
      const { w, data } = await renderBook(opts);
      const pdf = await w.webContents.printToPDF({ pageSize: data.pageSize, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: false });
      w.destroy();
      const name = `${data.book.title} - ${data.book.subtitle}.pdf`.replace(/[\\/:*?"<>|]+/g, " ");
      const r = await dialog.showSaveDialog(win!, { title: "Save the rulebook as a PDF", defaultPath: join(app.getPath("documents"), name), filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (r.canceled || !r.filePath) return { ok: true, value: null };
      writeFileSync(r.filePath, pdf);
      return { ok: true, value: r.filePath };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle("dm:bookPrint", async (_e, opts: BookRequest) => {
    try {
      const { w } = await renderBook(opts);
      const ok = await new Promise<boolean>((resolve) => w.webContents.print({ silent: false, printBackground: true, margins: { marginType: "none" } }, (success) => resolve(success)));
      w.destroy();
      return { ok: true, value: ok };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle("dm:openPath", (_e, path: string) => (typeof path === "string" && /\.(pdf|docx)$/i.test(path) ? shell.openPath(path) : ""));

  createWindow();
});

// Closing the window is a normal close: save anything waiting and let go of the world.
app.on("before-quit", () => backend?.shutdown());
app.on("window-all-closed", () => {
  backend?.shutdown();
  app.quit();
});
