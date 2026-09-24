export class TtlCache {
  private entries = new Map<string, { value: unknown; expires: number }>();

  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now()) return hit.value as T;
    const value = await load();
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    return value;
  }
}
