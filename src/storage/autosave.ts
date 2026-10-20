// "Saves itself constantly." Saves about a second after the last change, and never waits more
// than a few seconds while changes keep coming. `onSaved` is what makes the logo pulse.

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  now(): number;
}

export const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export class Autosaver {
  private timer: unknown = null;
  private firstPending: number | null = null;
  private readonly save: () => void;
  private readonly opts: { delayMs?: number; maxWaitMs?: number; onSaved?: () => void; onError?: (e: unknown) => void };
  private readonly timers: Timers;
  constructor(
    save: () => void,
    opts: { delayMs?: number; maxWaitMs?: number; onSaved?: () => void; onError?: (e: unknown) => void } = {},
    timers: Timers = realTimers,
  ) {
    this.save = save;
    this.opts = opts;
    this.timers = timers;
  }

  get pending(): boolean {
    return this.firstPending !== null;
  }

  /** Call after every change. */
  changed() {
    const delay = this.opts.delayMs ?? 1000;
    const maxWait = this.opts.maxWaitMs ?? 5000;
    const t = this.timers.now();
    this.firstPending ??= t;
    if (this.timer !== null) this.timers.clear(this.timer);
    const wait = Math.max(0, Math.min(delay, this.firstPending + maxWait - t));
    this.timer = this.timers.set(() => this.flush(), wait);
  }

  /** Saves now if anything is waiting. Called on close, too. */
  flush() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
    if (this.firstPending === null) return;
    this.firstPending = null;
    try {
      this.save();
      this.opts.onSaved?.();
    } catch (e) {
      // Never lose the change: try again on the next change or flush.
      this.firstPending = this.timers.now();
      this.opts.onError?.(e);
    }
  }
}
