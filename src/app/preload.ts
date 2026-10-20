// The only bridge between the window and the rest of the app. The window gets `window.dm` and
// nothing else: no files, no Node.

import { contextBridge, ipcRenderer } from "electron";
import type { BackendEvent } from "./backend.ts";

contextBridge.exposeInMainWorld("dm", {
  call: (method: string, args: unknown[]) => ipcRenderer.invoke("dm:call", method, args),
  showFolder: () => ipcRenderer.invoke("dm:showFolder"),
  onEvent: (fn: (e: BackendEvent) => void) => {
    ipcRenderer.on("dm:event", (_e, event: BackendEvent) => fn(event));
  },
});
