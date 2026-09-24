import { describe, it, expect, vi } from 'vitest';
import { TtlCache } from '../src/cache';

describe('TtlCache', () => {
  it('returns cached value within TTL', async () => {
    let t = 0;
    const cache = new TtlCache(1000, () => t);
    const load = vi.fn().mockResolvedValue('a');
    await cache.getOrLoad('k', load);
    t = 999;
    expect(await cache.getOrLoad('k', load)).toBe('a');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads after TTL', async () => {
    let t = 0;
    const cache = new TtlCache(1000, () => t);
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    await cache.getOrLoad('k', load);
    t = 1000;
    expect(await cache.getOrLoad('k', load)).toBe('b');
  });

  it('does not cache failures', async () => {
    const cache = new TtlCache(1000, () => 0);
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    await expect(cache.getOrLoad('k', load)).rejects.toThrow('x');
    expect(await cache.getOrLoad('k', load)).toBe('ok');
  });
});
