// The session timer's arithmetic (version 3): how long a game night has run, less any time paused.
// Kept apart from the rest of the table so the window can use it too.

export interface TimerState {
  started: number;
  ended: number | null;
  /** When the timer was paused, or null while it runs. */
  pausedAt: number | null;
  /** How long it has been paused in all, before now. */
  pausedMs: number;
}

/** Milliseconds the night has run: start to now (or to the end), less time paused. Never negative. */
export function sessionElapsed(s: TimerState, now: number): number {
  const end = s.ended ?? now;
  const pausedNow = s.pausedAt !== null ? Math.max(0, end - s.pausedAt) : 0;
  return Math.max(0, end - s.started - s.pausedMs - pausedNow);
}

/** 1:05:09 for an hour, five minutes and nine seconds; 4:30 under an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
