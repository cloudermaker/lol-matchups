export interface RateWindow { limit: number; windowMs: number }
export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// sliding windows; waits until every window has a free slot
export class RateLimiter {
  private stamps: number[] = [];
  private maxWindow: number;

  constructor(private windows: RateWindow[], private now: () => number = Date.now, private sleep: Sleep = realSleep) {
    this.maxWindow = Math.max(...windows.map((w) => w.windowMs));
  }

  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => s > t - this.maxWindow);
      const wait = Math.max(0, ...this.windows.map((w) => this.waitFor(w, t)));
      if (wait === 0) { this.stamps.push(t); return; }
      await this.sleep(wait);
    }
  }

  private waitFor({ limit, windowMs }: RateWindow, t: number): number {
    const inWindow = this.stamps.filter((s) => s > t - windowMs);
    return inWindow.length < limit ? 0 : inWindow[inWindow.length - limit] + windowMs - t;
  }
}
