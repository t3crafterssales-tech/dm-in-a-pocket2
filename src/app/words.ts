// Small plain-words helpers shared by the app's back end and its screens.

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "3 days ago", "Last week", "3 weeks ago", by calendar day. */
export function whenLabel(time: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "Last month" : `${months} months ago`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "1 world", "3 worlds". */
export function count(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}
