// The back/forward trail (navigation stage 1): where the person has been inside one open place,
// so Back and Forward can walk it like a browser. It only moves the view, never changes the work.

export interface Spot {
  /** The tab, such as "Beings". */
  tab: string;
  /** The thing open on that tab, or null for the tab's start screen. */
  sel: string | null;
}

export const TRAIL_MAX = 50;

const same = (a: Spot, b: Spot) => a.tab === b.tab && a.sel === b.sel;

export class Trail {
  private spots: Spot[] = [];
  private at = -1;

  /** Starting again, for instance when a different world opens. */
  reset() {
    this.spots = [];
    this.at = -1;
  }

  /** Notes where the person is now. Looking at the same spot twice adds nothing; going somewhere new drops the forward steps. */
  record(spot: Spot) {
    if (this.at >= 0 && same(this.spots[this.at]!, spot)) return;
    this.spots = [...this.spots.slice(0, this.at + 1), { ...spot }];
    if (this.spots.length > TRAIL_MAX) this.spots.shift();
    this.at = this.spots.length - 1;
  }

  get canBack() {
    return this.at > 0;
  }

  get canForward() {
    return this.at >= 0 && this.at < this.spots.length - 1;
  }

  /** One step back, or null if there is nowhere to go. */
  back(): Spot | null {
    if (!this.canBack) return null;
    this.at--;
    return { ...this.spots[this.at]! };
  }

  forward(): Spot | null {
    if (!this.canForward) return null;
    this.at++;
    return { ...this.spots[this.at]! };
  }

  /** Forgets a spot that no longer exists (a deleted sheet), so Back never lands on nothing. */
  drop(sel: string) {
    const keep: Spot[] = [];
    let at = -1;
    this.spots.forEach((s, i) => {
      if (s.sel === sel) return;
      if (keep.length && same(keep[keep.length - 1]!, s)) return void (i <= this.at && (at = keep.length - 1));
      keep.push(s);
      if (i <= this.at) at = keep.length - 1;
    });
    this.spots = keep;
    this.at = Math.min(at, keep.length - 1);
  }
}
