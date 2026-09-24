import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/riot/rateLimiter';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, time: () => t };
}

describe('RateLimiter', () => {
  it('lets calls through under the limit', async () => {
    const c = clock();
    const l = new RateLimiter([{ limit: 2, windowMs: 1000 }], c.now, c.sleep);
    await l.acquire();
    await l.acquire();
    expect(c.time()).toBe(0);
  });

  it('waits for the window when full', async () => {
    const c = clock();
    const l = new RateLimiter([{ limit: 2, windowMs: 1000 }], c.now, c.sleep);
    await l.acquire(); await l.acquire(); await l.acquire();
    expect(c.time()).toBe(1000);
  });

  it('respects the strictest of several windows', async () => {
    const c = clock();
    const l = new RateLimiter([{ limit: 2, windowMs: 1000 }, { limit: 3, windowMs: 10_000 }], c.now, c.sleep);
    await l.acquire(); await l.acquire(); await l.acquire();
    expect(c.time()).toBe(1000);
    await l.acquire();
    expect(c.time()).toBe(10_000);
  });
});
