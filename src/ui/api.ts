// The window's way to reach the back end. Every call goes through the preload bridge, and errors
// come back as plain messages to show the user.

import type { Backend, BackendEvent, BackendMethod } from "../app/backend.ts";

type Result = { ok: true; value: unknown } | { ok: false; message: string };

declare global {
  interface Window {
    dm: {
      call(method: BackendMethod, args: unknown[]): Promise<Result>;
      showFolder(): Promise<string>;
      bookPdf(opts: unknown): Promise<Result>;
      bookPrint(opts: unknown): Promise<Result>;
      openPdf(path: string): Promise<string>;
      onEvent(fn: (e: BackendEvent) => void): void;
    };
  }
}

export class AppError extends Error {}

type Api = { [K in BackendMethod]: (...args: Parameters<Backend[K]>) => Promise<Awaited<ReturnType<Backend[K]>>> };

export const api = new Proxy({} as Api, {
  get: (_t, method: string) =>
    async (...args: unknown[]) => {
      const r = await window.dm.call(method as BackendMethod, args);
      if (!r.ok) throw new AppError(r.message);
      return r.value;
    },
});

export function pictureUrl(id: string): string {
  return `dmpic://pic/${encodeURIComponent(id)}`;
}
