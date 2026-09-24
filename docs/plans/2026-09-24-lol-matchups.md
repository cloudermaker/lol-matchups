# LoL Matchups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local site: pick champion + lane → top 5 counters (EUW, Platinum) + build advice.

**Architecture:** npm workspaces: `shared` (types), `server` (Express + TS, provider interface, lolalytics provider, Data Dragon, cache), `web` (React + Vite, proxies `/api` to server). Providers return raw ids; the server enriches them with Data Dragon names/icons.

**Tech Stack:** Node ≥22, TypeScript, Express 5, tsx, React 19, Vite, Vitest, supertest, @testing-library/react.

**Spec:** `docs/specs/2026-09-24-lol-matchups-design.md`

## Global Constraints
- Region `euw`, tier `platinum`, queue `ranked`.
- Lanes: `top | jungle | middle | bottom | support`.
- Win rate shown = searched champion's win rate vs opponent (lolalytics `vsWr`).
- Counters = lowest win rate, games ≥ `MIN_GAMES` (default **1000**, configurable), top 5.
- Cache TTL 6 h.
- Private: no git remote, no deployment, `.env` git-ignored.
- Do **not** commit unless the user asks (user rule). "Commit" steps below become "stage only" (`git add`).
- Code comments: one short line, only where useful.

## Data notes (verified 2026-09-24)
- Base: `https://a1.lolalytics.com/mega/?v=1&patch=30&c={slug}&lane={lane}&tier=platinum&queue=ranked&region=euw&ep={ep}`
- `slug` = Data Dragon champion id lower-cased; exception `MonkeyKing` → `wukong`.
- Unknown champ/lane → HTTP 200 body `{"status":404}`.
- `ep=counter` → `counters: [{ cid, vsWr, n, ... }]` (`cid` = Data Dragon numeric `key`).
- `ep=build-itemset` → `itemSets.itemSet3: [["idA_idB_idC", games, wins], ...]` (first 3 items, no boots); `itemBootSetN` = same incl. boots.
- `ep=build-earlyset` → `earlySet: [["id_id_...", wr, pr, games], ...]`.
- Runes, summoners and matchup-specific builds: no endpoint found → v1 omits them; `getBuild(..., vs)` returns `null` and UI says "Not enough data".
- Data Dragon: `https://ddragon.leagueoflegends.com/api/versions.json`, `/cdn/{v}/data/en_US/champion.json`, `/cdn/{v}/data/en_US/item.json`, icons `/cdn/{v}/img/champion/{image.full}` and `/cdn/{v}/img/item/{id}.png`. Boots = items with tag `Boots`.

## Review Focus
1. Champion whose slug differs from its name (Wukong, Dr. Mundo, K'Sante) → must still work. Test in Task 4.
2. lolalytics returns `{"status":404}` with HTTP 200 → server answers 502, not an empty list. Test in Task 4.
3. Unknown champion or lane in API query → 400 with message, provider not called. Test in Task 6.
4. Fewer than 5 counters above MIN_GAMES → return what exists, no crash. Test in Task 5.
5. Counter `cid` not in Data Dragon (new champion) → skipped, not a crash. Test in Task 5.

## File structure
```
package.json                 workspaces root, scripts
tsconfig.base.json
.gitignore  .env.example  README.md
shared/package.json  shared/src/types.ts
server/package.json  server/tsconfig.json  server/vitest.config.ts
server/src/config.ts         env → Config
server/src/cache.ts          TtlCache
server/src/http.ts           fetchJson helper
server/src/dataDragon.ts     DataDragon (champions/items)
server/src/providers/types.ts
server/src/providers/lolalytics.ts
server/src/providers/riotCrawler.ts
server/src/providers/index.ts
server/src/matchup.ts        MatchupService (enrich/filter/sort)
server/src/app.ts            createApp(deps) → Express
server/src/server.ts         wiring + listen
server/test/*.test.ts  server/test/fixtures/*.json
web/package.json  web/tsconfig.json  web/vite.config.ts  web/index.html
web/src/main.tsx  web/src/App.tsx  web/src/api.ts  web/src/style.css
web/src/components/{ChampionPicker,LanePicker,CounterList,BuildPanel}.tsx
web/src/components/CounterList.test.tsx
```

---

### Task 1: Workspace scaffold + shared types

**Files:** Create root `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `shared/package.json`, `shared/src/types.ts`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/test/smoke.test.ts`.

**Interfaces — Produces** (`shared/src/types.ts`):
```ts
export const LANES = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;
export type Lane = (typeof LANES)[number];

export interface Champion { id: string; key: number; name: string; icon: string }
export interface Item { id: string; name: string; icon: string }
export interface Counter { champion: Champion; winRate: number; games: number }
export interface Build { early: Item[]; core: Item[]; boots: Item | null; games: number; winRate: number }
export interface MatchupResponse { champion: Champion; lane: Lane; counters: Counter[]; build: Build | null }
export interface BuildResponse { build: Build | null }
export interface ErrorResponse { error: string }
```

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "lol-matchups",
  "private": true,
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "dev:server": "npm run dev -w server",
    "dev:web": "npm run dev -w web",
    "test": "npm test -w server && npm test -w web",
    "typecheck": "npm run typecheck -w server && npm run typecheck -w web"
  }
}
```
`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "noEmit": true
  }
}
```
`.gitignore`:
```
node_modules/
dist/
.env
*.sqlite
```
`.env.example`:
```
PROVIDER=lolalytics
PORT=3001
MIN_GAMES=1000
RIOT_API_KEY=
```

- [ ] **Step 2: shared package**

`shared/package.json`:
```json
{ "name": "@lol/shared", "private": true, "type": "module", "main": "src/types.ts", "types": "src/types.ts" }
```
`shared/src/types.ts`: content from Interfaces above.

- [ ] **Step 3: server package**

`server/package.json`:
```json
{
  "name": "@lol/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../.env src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc -p ."
  },
  "dependencies": { "@lol/shared": "*", "express": "^5.1.0" },
  "devDependencies": {
    "@types/express": "^5.0.0", "@types/node": "^22.0.0", "@types/supertest": "^6.0.0",
    "supertest": "^7.0.0", "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^3.0.0"
  }
}
```
`server/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src", "test"] }
```
`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 4: Smoke test** — `server/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LANES } from '@lol/shared';

describe('shared types', () => {
  it('exposes the five lanes', () => {
    expect(LANES).toEqual(['top', 'jungle', 'middle', 'bottom', 'support']);
  });
});
```

- [ ] **Step 5: Install and run** (`web` workspace does not exist yet; create an empty `web/package.json` `{ "name": "@lol/web", "private": true }` so workspaces resolve — Task 7 replaces it)

Run: `npm install && npm test -w server && npm run typecheck -w server`
Expected: 1 test PASS, typecheck clean.

- [ ] **Step 6: Stage** — `git add -A`

---

### Task 2: TTL cache + config

**Files:** Create `server/src/cache.ts`, `server/src/config.ts`, `server/test/cache.test.ts`, `server/test/config.test.ts`.

**Interfaces — Produces:**
```ts
export class TtlCache {
  constructor(ttlMs: number, now?: () => number);
  getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T>; // failures are not cached
}
export interface Config { provider: 'lolalytics' | 'riot'; port: number; minGames: number; riotApiKey?: string }
export function loadConfig(env?: NodeJS.ProcessEnv): Config;
```

- [ ] **Step 1: Failing tests** — `server/test/cache.test.ts`:
```ts
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
```
`server/test/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('uses defaults', () => {
    expect(loadConfig({})).toEqual({ provider: 'lolalytics', port: 3001, minGames: 1000, riotApiKey: undefined });
  });
  it('reads env', () => {
    expect(loadConfig({ PROVIDER: 'riot', PORT: '4000', MIN_GAMES: '500', RIOT_API_KEY: 'k' }))
      .toEqual({ provider: 'riot', port: 4000, minGames: 500, riotApiKey: 'k' });
  });
  it('rejects unknown provider', () => {
    expect(() => loadConfig({ PROVIDER: 'opgg' })).toThrow('Unknown PROVIDER');
  });
});
```

- [ ] **Step 2: Run** `npm test -w server` → FAIL (modules missing).

- [ ] **Step 3: Implement** — `server/src/cache.ts`:
```ts
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
```
`server/src/config.ts`:
```ts
export interface Config { provider: 'lolalytics' | 'riot'; port: number; minGames: number; riotApiKey?: string }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = env.PROVIDER ?? 'lolalytics';
  if (provider !== 'lolalytics' && provider !== 'riot') throw new Error(`Unknown PROVIDER: ${provider}`);
  return {
    provider,
    port: Number(env.PORT ?? 3001),
    minGames: Number(env.MIN_GAMES ?? 1000),
    riotApiKey: env.RIOT_API_KEY || undefined,
  };
}
```

- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Stage** — `git add -A`

---

### Task 3: HTTP helper + Data Dragon

**Files:** Create `server/src/http.ts`, `server/src/dataDragon.ts`, `server/test/dataDragon.test.ts`.

**Interfaces — Produces:**
```ts
export type FetchJson = (url: string) => Promise<unknown>;
export const fetchJson: FetchJson;         // throws on non-2xx or network error
export class DataDragon {
  constructor(fetchJson: FetchJson);
  load(): Promise<void>;                    // fetches latest version, champions, items
  champions(): Champion[];                  // sorted by name
  championById(id: string): Champion | undefined;   // case-insensitive, 'darius' ok
  championByKey(key: number): Champion | undefined;
  item(id: string): Item | undefined;
  isBoots(id: string): boolean;
}
```

- [ ] **Step 1: Failing test** — `server/test/dataDragon.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DataDragon } from '../src/dataDragon';

const CDN = 'https://ddragon.leagueoflegends.com';
const responses: Record<string, unknown> = {
  [`${CDN}/api/versions.json`]: ['16.19.1', '16.18.1'],
  [`${CDN}/cdn/16.19.1/data/en_US/champion.json`]: {
    data: {
      Darius: { id: 'Darius', key: '122', name: 'Darius', image: { full: 'Darius.png' } },
      MonkeyKing: { id: 'MonkeyKing', key: '62', name: 'Wukong', image: { full: 'MonkeyKing.png' } },
    },
  },
  [`${CDN}/cdn/16.19.1/data/en_US/item.json`]: {
    data: {
      '3047': { name: "Plated Steelcaps", tags: ['Boots', 'Armor'] },
      '3142': { name: "Youmuu's Ghostblade", tags: ['Damage'] },
    },
  },
};
const fakeFetch = async (url: string) => {
  if (!(url in responses)) throw new Error(`unexpected ${url}`);
  return responses[url];
};

describe('DataDragon', () => {
  it('loads champions and items from latest version', async () => {
    const dd = new DataDragon(fakeFetch);
    await dd.load();
    expect(dd.champions().map((c) => c.name)).toEqual(['Darius', 'Wukong']);
    expect(dd.championById('darius')).toEqual({
      id: 'Darius', key: 122, name: 'Darius', icon: `${CDN}/cdn/16.19.1/img/champion/Darius.png`,
    });
    expect(dd.championByKey(62)?.id).toBe('MonkeyKing');
    expect(dd.item('3142')).toEqual({ id: '3142', name: "Youmuu's Ghostblade", icon: `${CDN}/cdn/16.19.1/img/item/3142.png` });
    expect(dd.isBoots('3047')).toBe(true);
    expect(dd.isBoots('3142')).toBe(false);
  });

  it('returns undefined for unknown ids', async () => {
    const dd = new DataDragon(fakeFetch);
    await dd.load();
    expect(dd.championById('zzz')).toBeUndefined();
    expect(dd.championByKey(9999)).toBeUndefined();
    expect(dd.item('1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** `npm test -w server` → FAIL.

- [ ] **Step 3: Implement** — `server/src/http.ts`:
```ts
export type FetchJson = (url: string) => Promise<unknown>;

export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 lol-matchups' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};
```
`server/src/dataDragon.ts`:
```ts
import type { Champion, Item } from '@lol/shared';
import type { FetchJson } from './http';

const CDN = 'https://ddragon.leagueoflegends.com';

interface RawChampion { id: string; key: string; name: string; image: { full: string } }
interface RawItem { name: string; tags?: string[] }

export class DataDragon {
  private byId = new Map<string, Champion>();
  private byKey = new Map<number, Champion>();
  private items = new Map<string, Item>();
  private boots = new Set<string>();

  constructor(private fetchJson: FetchJson) {}

  async load(): Promise<void> {
    const [version] = (await this.fetchJson(`${CDN}/api/versions.json`)) as string[];
    const base = `${CDN}/cdn/${version}`;
    const champs = (await this.fetchJson(`${base}/data/en_US/champion.json`)) as { data: Record<string, RawChampion> };
    const items = (await this.fetchJson(`${base}/data/en_US/item.json`)) as { data: Record<string, RawItem> };

    for (const c of Object.values(champs.data)) {
      const champ: Champion = { id: c.id, key: Number(c.key), name: c.name, icon: `${base}/img/champion/${c.image.full}` };
      this.byId.set(c.id.toLowerCase(), champ);
      this.byKey.set(champ.key, champ);
    }
    for (const [id, i] of Object.entries(items.data)) {
      this.items.set(id, { id, name: i.name, icon: `${base}/img/item/${id}.png` });
      if (i.tags?.includes('Boots')) this.boots.add(id);
    }
  }

  champions(): Champion[] {
    return [...this.byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  championById(id: string) { return this.byId.get(id.toLowerCase()); }
  championByKey(key: number) { return this.byKey.get(key); }
  item(id: string) { return this.items.get(id); }
  isBoots(id: string) { return this.boots.has(id); }
}
```

- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Stage** — `git add -A`

---

### Task 4: Provider interface + lolalytics provider

**Files:** Create `server/src/providers/types.ts`, `server/src/providers/lolalytics.ts`, `server/test/lolalytics.test.ts`. Fixtures already exist: `server/test/fixtures/{counter,itemset,earlyset}-darius-top.json` (trimmed real responses).

**Interfaces:**
- Consumes: `FetchJson` (Task 3), `Lane` (Task 1).
- Produces (`providers/types.ts`):
```ts
import type { Lane } from '@lol/shared';
export interface RawCounter { championKey: number; winRate: number; games: number }
export interface RawBuild { early: string[]; core: string[]; bootsCandidates: string[]; games: number; winRate: number }
export interface Provider {
  getCounters(championId: string, lane: Lane): Promise<RawCounter[]>;
  getBuild(championId: string, lane: Lane, vsChampionId?: string): Promise<RawBuild | null>;
}
export class ProviderError extends Error {}
```
- `championId` = Data Dragon id (e.g. `Darius`, `MonkeyKing`).
- `bootsCandidates` = every item id from `itemBootSet*` entries, most-played first (by summed games); `MatchupService` picks the first that `DataDragon.isBoots`.
- `lolalyticsSlug(id)` exported for tests.

- [ ] **Step 1: Failing test** — `server/test/lolalytics.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LolalyticsProvider, lolalyticsSlug } from '../src/providers/lolalytics';
import { ProviderError } from '../src/providers/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const byEp: Record<string, unknown> = {
  counter: fixture('counter-darius-top.json'),
  'build-itemset': fixture('itemset-darius-top.json'),
  'build-earlyset': fixture('earlyset-darius-top.json'),
};

function recordingFetch(body?: unknown) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    return body ?? byEp[new URL(url).searchParams.get('ep')!];
  };
  return { fn, urls };
}

describe('lolalyticsSlug', () => {
  it('lower-cases ids and maps Wukong', () => {
    expect(lolalyticsSlug('Darius')).toBe('darius');
    expect(lolalyticsSlug('DrMundo')).toBe('drmundo');
    expect(lolalyticsSlug('KSante')).toBe('ksante');
    expect(lolalyticsSlug('MonkeyKing')).toBe('wukong');
  });
});

describe('LolalyticsProvider', () => {
  it('builds the EUW Platinum counter URL', async () => {
    const { fn, urls } = recordingFetch();
    await new LolalyticsProvider(fn).getCounters('MonkeyKing', 'top');
    const q = new URL(urls[0]).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      ep: 'counter', c: 'wukong', lane: 'top', tier: 'platinum', queue: 'ranked', region: 'euw',
    });
  });

  it('normalises counters', async () => {
    const counters = await new LolalyticsProvider(recordingFetch().fn).getCounters('Darius', 'top');
    expect(counters).toHaveLength(127);
    expect(counters).toContainEqual({ championKey: 62, winRate: 46.18, games: 2984 });
  });

  it('throws ProviderError on {"status":404}', async () => {
    const p = new LolalyticsProvider(recordingFetch({ status: 404 }).fn);
    await expect(p.getCounters('Zzz', 'top')).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on network failure', async () => {
    const p = new LolalyticsProvider(async () => { throw new Error('ECONNRESET'); });
    await expect(p.getCounters('Darius', 'top')).rejects.toBeInstanceOf(ProviderError);
  });

  it('normalises the general build', async () => {
    const build = await new LolalyticsProvider(recordingFetch().fn).getBuild('Darius', 'top');
    expect(build).toEqual({
      early: ['1055', '1001', '1029', '1036', '3047'],
      core: ['3142', '3742', '6333'],
      bootsCandidates: expect.arrayContaining(['3047', '3111']),
      games: 5062,
      winRate: 57.65,
    });
    expect(build!.bootsCandidates.slice(0, 2)).toEqual(['3047', '3142']);
  });

  it('returns null for matchup builds (no endpoint yet)', async () => {
    const { fn, urls } = recordingFetch();
    expect(await new LolalyticsProvider(fn).getBuild('Darius', 'top', 'Malphite')).toBeNull();
    expect(urls).toHaveLength(0);
  });
});
```
Note: `bootsCandidates` mixes boots and other items (summed games across boot sets: 3047=20687, 3142=17336); the service keeps the first real boots. `winRate` = 2918/5062 rounded to 2 dp.

- [ ] **Step 2: Run** `npm test -w server` → FAIL.

- [ ] **Step 3: Implement** — `server/src/providers/types.ts`: content from Interfaces.

`server/src/providers/lolalytics.ts`:
```ts
import type { Lane } from '@lol/shared';
import type { FetchJson } from '../http';
import { ProviderError, type Provider, type RawBuild, type RawCounter } from './types';

const BASE = 'https://a1.lolalytics.com/mega/';
const SLUG_OVERRIDES: Record<string, string> = { MonkeyKing: 'wukong' };

type SetEntry = [ids: string, games: number, wins: number];

export function lolalyticsSlug(id: string): string {
  return SLUG_OVERRIDES[id] ?? id.toLowerCase();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class LolalyticsProvider implements Provider {
  constructor(private fetchJson: FetchJson) {}

  private async get<T>(ep: string, championId: string, lane: Lane): Promise<T> {
    const q = new URLSearchParams({
      ep, v: '1', patch: '30', c: lolalyticsSlug(championId), lane,
      tier: 'platinum', queue: 'ranked', region: 'euw',
    });
    let body: unknown;
    try {
      body = await this.fetchJson(`${BASE}?${q}`);
    } catch (e) {
      throw new ProviderError(`lolalytics ${ep} failed: ${(e as Error).message}`);
    }
    if (!body || typeof body !== 'object' || 'status' in body) {
      throw new ProviderError(`lolalytics ${ep}: no data for ${championId}/${lane}`);
    }
    return body as T;
  }

  async getCounters(championId: string, lane: Lane): Promise<RawCounter[]> {
    const body = await this.get<{ counters?: { cid: number; vsWr: number; n: number }[] }>('counter', championId, lane);
    if (!Array.isArray(body.counters)) throw new ProviderError('lolalytics counter: unexpected shape');
    return body.counters.map((c) => ({ championKey: c.cid, winRate: c.vsWr, games: c.n }));
  }

  async getBuild(championId: string, lane: Lane, vsChampionId?: string): Promise<RawBuild | null> {
    if (vsChampionId) return null;
    const [items, early] = await Promise.all([
      this.get<{ itemSets?: Record<string, SetEntry[]> }>('build-itemset', championId, lane),
      this.get<{ earlySet?: [string, number, number, number][] }>('build-earlyset', championId, lane),
    ]);
    const sets = items.itemSets;
    const core = sets?.itemSet3?.slice().sort((a, b) => b[1] - a[1])[0];
    if (!sets || !core) return null;

    const bootGames = new Map<string, number>();
    for (const [name, entries] of Object.entries(sets)) {
      if (!name.startsWith('itemBootSet')) continue;
      for (const [ids, games] of entries) {
        for (const id of ids.split('_')) bootGames.set(id, (bootGames.get(id) ?? 0) + games);
      }
    }
    const topEarly = early.earlySet?.slice().sort((a, b) => b[3] - a[3])[0];

    return {
      early: topEarly ? topEarly[0].split('_') : [],
      core: core[0].split('_'),
      bootsCandidates: [...bootGames.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
      games: core[1],
      winRate: round2((core[2] / core[1]) * 100),
    };
  }
}
```

- [ ] **Step 4: Run** `npm test -w server` → PASS. If `early` assertion fails, print `fixture('earlyset-darius-top.json').earlySet` and fix the expected array to the entry with highest games (index 3) — the fixture is the source of truth.
- [ ] **Step 5: Stage** — `git add -A`

---

### Task 5: MatchupService (enrich, filter, sort)

**Files:** Create `server/src/matchup.ts`, `server/test/matchup.test.ts`.

**Interfaces:**
- Consumes: `Provider`, `RawCounter`, `RawBuild` (Task 4); `DataDragon` (Task 3); `TtlCache` (Task 2).
- Produces:
```ts
export interface Catalog {
  championByKey(key: number): Champion | undefined;
  item(id: string): Item | undefined;
  isBoots(id: string): boolean;
}
export class MatchupService {
  constructor(provider: Provider, catalog: Catalog, cache: TtlCache, minGames: number);
  getMatchup(champion: Champion, lane: Lane): Promise<MatchupResponse>;
  getBuild(champion: Champion, lane: Lane, vs?: Champion): Promise<BuildResponse>;
}
```

- [ ] **Step 1: Failing test** — `server/test/matchup.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import type { Champion } from '@lol/shared';
import { MatchupService, type Catalog } from '../src/matchup';
import { TtlCache } from '../src/cache';
import type { Provider } from '../src/providers/types';

const champ = (key: number, id = `C${key}`): Champion => ({ id, key, name: id, icon: `${id}.png` });
const catalog: Catalog = {
  championByKey: (k) => (k === 999 ? undefined : champ(k)),
  item: (id) => ({ id, name: `I${id}`, icon: `${id}.png` }),
  isBoots: (id) => id === '3047',
};
const darius = champ(122, 'Darius');

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    getCounters: vi.fn().mockResolvedValue([
      { championKey: 1, winRate: 48, games: 5000 },
      { championKey: 2, winRate: 40, games: 50 },    // below minGames
      { championKey: 3, winRate: 45, games: 1000 },  // exactly minGames: kept
      { championKey: 4, winRate: 52, games: 8000 },
      { championKey: 5, winRate: 47, games: 3000 },
      { championKey: 6, winRate: 49, games: 2000 },
      { championKey: 7, winRate: 46, games: 4000 },
      { championKey: 999, winRate: 30, games: 9000 }, // unknown to catalog
    ]),
    getBuild: vi.fn().mockResolvedValue({
      early: ['1055'], core: ['3142', '3742', '6333'], bootsCandidates: ['3142', '3047'], games: 5062, winRate: 57.65,
    }),
    ...overrides,
  };
}
const service = (p: Provider) => new MatchupService(p, catalog, new TtlCache(60_000), 1000);

describe('MatchupService.getMatchup', () => {
  it('returns 5 lowest win rates above minGames, skipping unknown champions', async () => {
    const res = await service(provider()).getMatchup(darius, 'top');
    expect(res.counters.map((c) => c.champion.key)).toEqual([3, 7, 5, 1, 6]);
    expect(res.counters[0]).toEqual({ champion: champ(3), winRate: 45, games: 1000 });
  });

  it('returns fewer than 5 when not enough data', async () => {
    const p = provider({ getCounters: vi.fn().mockResolvedValue([{ championKey: 1, winRate: 48, games: 5000 }]) });
    expect((await service(p).getMatchup(darius, 'top')).counters).toHaveLength(1);
  });

  it('enriches the general build and picks real boots', async () => {
    const res = await service(provider()).getMatchup(darius, 'top');
    expect(res.build).toEqual({
      early: [{ id: '1055', name: 'I1055', icon: '1055.png' }],
      core: ['3142', '3742', '6333'].map((id) => ({ id, name: `I${id}`, icon: `${id}.png` })),
      boots: { id: '3047', name: 'I3047', icon: '3047.png' },
      games: 5062,
      winRate: 57.65,
    });
  });

  it('caches per champion+lane', async () => {
    const p = provider();
    const s = service(p);
    await s.getMatchup(darius, 'top');
    await s.getMatchup(darius, 'top');
    await s.getMatchup(darius, 'jungle');
    expect(p.getCounters).toHaveBeenCalledTimes(2);
  });
});

describe('MatchupService.getBuild', () => {
  it('passes the opponent id and returns null build when provider has none', async () => {
    const p = provider({ getBuild: vi.fn().mockResolvedValue(null) });
    expect(await service(p).getBuild(darius, 'top', champ(54, 'Malphite'))).toEqual({ build: null });
    expect(p.getBuild).toHaveBeenCalledWith('Darius', 'top', 'Malphite');
  });
});
```

- [ ] **Step 2: Run** `npm test -w server` → FAIL.

- [ ] **Step 3: Implement** — `server/src/matchup.ts`:
```ts
import type { Build, BuildResponse, Champion, Counter, Item, Lane, MatchupResponse } from '@lol/shared';
import type { TtlCache } from './cache';
import type { Provider, RawBuild } from './providers/types';

export interface Catalog {
  championByKey(key: number): Champion | undefined;
  item(id: string): Item | undefined;
  isBoots(id: string): boolean;
}

export class MatchupService {
  constructor(
    private provider: Provider,
    private catalog: Catalog,
    private cache: TtlCache,
    private minGames: number,
  ) {}

  getMatchup(champion: Champion, lane: Lane): Promise<MatchupResponse> {
    return this.cache.getOrLoad(`matchup:${champion.id}:${lane}`, async () => {
      const [raw, build] = await Promise.all([
        this.provider.getCounters(champion.id, lane),
        this.provider.getBuild(champion.id, lane),
      ]);
      const counters: Counter[] = raw
        .filter((c) => c.games >= this.minGames)
        .flatMap((c) => {
          const opp = this.catalog.championByKey(c.championKey);
          return opp ? [{ champion: opp, winRate: c.winRate, games: c.games }] : [];
        })
        .sort((a, b) => a.winRate - b.winRate)
        .slice(0, 5);
      return { champion, lane, counters, build: this.enrich(build) };
    });
  }

  getBuild(champion: Champion, lane: Lane, vs?: Champion): Promise<BuildResponse> {
    return this.cache.getOrLoad(`build:${champion.id}:${lane}:${vs?.id ?? ''}`, async () => ({
      build: this.enrich(await this.provider.getBuild(champion.id, lane, vs?.id)),
    }));
  }

  private enrich(raw: RawBuild | null): Build | null {
    if (!raw) return null;
    const items = (ids: string[]) => ids.flatMap((id) => this.catalog.item(id) ?? []);
    const bootsId = raw.bootsCandidates.find((id) => this.catalog.isBoots(id));
    return {
      early: items(raw.early),
      core: items(raw.core),
      boots: bootsId ? (this.catalog.item(bootsId) ?? null) : null,
      games: raw.games,
      winRate: raw.winRate,
    };
  }
}
```

- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Stage** — `git add -A`

---

### Task 6: Express app + provider selection + riot stub

**Files:** Create `server/src/app.ts`, `server/src/providers/riotCrawler.ts`, `server/src/providers/index.ts`, `server/src/server.ts`, `server/test/app.test.ts`.

**Interfaces:**
- Consumes: `MatchupService` (Task 5), `DataDragon` (Task 3), `ProviderError` (Task 4), `Config` (Task 2).
- Produces:
```ts
export interface AppDeps {
  champions: { champions(): Champion[]; championById(id: string): Champion | undefined };
  matchups: Pick<MatchupService, 'getMatchup' | 'getBuild'>;
}
export function createApp(deps: AppDeps): express.Express;
export function createProvider(config: Config, fetchJson: FetchJson): Provider;
```
Routes: `GET /api/champions`, `GET /api/matchup?champ=&lane=`, `GET /api/build?champ=&lane=&vs=`.

- [ ] **Step 1: Failing test** — `server/test/app.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Champion } from '@lol/shared';
import { createApp, type AppDeps } from '../src/app';
import { ProviderError } from '../src/providers/types';

const darius: Champion = { id: 'Darius', key: 122, name: 'Darius', icon: 'd.png' };
const malphite: Champion = { id: 'Malphite', key: 54, name: 'Malphite', icon: 'm.png' };
const all = [darius, malphite];

function deps(overrides: Partial<AppDeps['matchups']> = {}): AppDeps {
  return {
    champions: { champions: () => all, championById: (id) => all.find((c) => c.id.toLowerCase() === id.toLowerCase()) },
    matchups: {
      getMatchup: vi.fn().mockResolvedValue({ champion: darius, lane: 'top', counters: [], build: null }),
      getBuild: vi.fn().mockResolvedValue({ build: null }),
      ...overrides,
    },
  };
}

describe('API', () => {
  it('lists champions', async () => {
    const res = await request(createApp(deps())).get('/api/champions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(all);
  });

  it('returns a matchup', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/matchup?champ=darius&lane=top');
    expect(res.status).toBe(200);
    expect(d.matchups.getMatchup).toHaveBeenCalledWith(darius, 'top');
  });

  it('400 on unknown champion, provider not called', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/matchup?champ=zzz&lane=top');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown champion: zzz' });
    expect(d.matchups.getMatchup).not.toHaveBeenCalled();
  });

  it('400 on invalid lane', async () => {
    const res = await request(createApp(deps())).get('/api/matchup?champ=darius&lane=bot');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid lane: bot' });
  });

  it('400 on missing params', async () => {
    const res = await request(createApp(deps())).get('/api/matchup');
    expect(res.status).toBe(400);
  });

  it('502 when provider fails', async () => {
    const res = await request(createApp(deps({ getMatchup: vi.fn().mockRejectedValue(new ProviderError('down')) })))
      .get('/api/matchup?champ=darius&lane=top');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Data source unavailable' });
  });

  it('returns a matchup build', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/build?champ=darius&lane=top&vs=malphite');
    expect(res.status).toBe(200);
    expect(d.matchups.getBuild).toHaveBeenCalledWith(darius, 'top', malphite);
  });

  it('400 on unknown opponent', async () => {
    const res = await request(createApp(deps())).get('/api/build?champ=darius&lane=top&vs=zzz');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** `npm test -w server` → FAIL.

- [ ] **Step 3: Implement** — `server/src/app.ts`:
```ts
import express, { type NextFunction, type Request, type Response } from 'express';
import { LANES, type Champion, type Lane } from '@lol/shared';
import type { MatchupService } from './matchup';
import { ProviderError } from './providers/types';

export interface AppDeps {
  champions: { champions(): Champion[]; championById(id: string): Champion | undefined };
  matchups: Pick<MatchupService, 'getMatchup' | 'getBuild'>;
}

class BadRequest extends Error {}

export function createApp({ champions, matchups }: AppDeps) {
  const app = express();

  const champion = (value: unknown): Champion => {
    const c = typeof value === 'string' ? champions.championById(value) : undefined;
    if (!c) throw new BadRequest(`Unknown champion: ${value ?? ''}`);
    return c;
  };
  const lane = (value: unknown): Lane => {
    if (!LANES.includes(value as Lane)) throw new BadRequest(`Invalid lane: ${value ?? ''}`);
    return value as Lane;
  };

  app.get('/api/champions', (_req, res) => { res.json(champions.champions()); });

  app.get('/api/matchup', async (req, res) => {
    const c = champion(req.query.champ);
    res.json(await matchups.getMatchup(c, lane(req.query.lane)));
  });

  app.get('/api/build', async (req, res) => {
    const c = champion(req.query.champ);
    const l = lane(req.query.lane);
    const vs = req.query.vs ? champion(req.query.vs) : undefined;
    res.json(await matchups.getBuild(c, l, vs));
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return void res.status(400).json({ error: err.message });
    console.error(err);
    if (err instanceof ProviderError) return void res.status(502).json({ error: 'Data source unavailable' });
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
```
Express 5 forwards rejected async handlers to the error middleware; no wrapper needed.

`server/src/providers/riotCrawler.ts`:
```ts
import type { Provider } from './types';

// Future: crawl EUW Platinum ranked matches into SQLite and aggregate.
export class RiotCrawlerProvider implements Provider {
  constructor(private apiKey?: string) {}
  async getCounters(): Promise<never> { throw new Error('Riot crawler provider not implemented yet'); }
  async getBuild(): Promise<never> { throw new Error('Riot crawler provider not implemented yet'); }
}
```
`server/src/providers/index.ts`:
```ts
import type { Config } from '../config';
import type { FetchJson } from '../http';
import { LolalyticsProvider } from './lolalytics';
import { RiotCrawlerProvider } from './riotCrawler';
import type { Provider } from './types';

export function createProvider(config: Config, fetchJson: FetchJson): Provider {
  return config.provider === 'riot' ? new RiotCrawlerProvider(config.riotApiKey) : new LolalyticsProvider(fetchJson);
}
```
`server/src/server.ts`:
```ts
import { createApp } from './app';
import { TtlCache } from './cache';
import { loadConfig } from './config';
import { DataDragon } from './dataDragon';
import { fetchJson } from './http';
import { MatchupService } from './matchup';
import { createProvider } from './providers';

const config = loadConfig();
const dd = new DataDragon(fetchJson);
await dd.load();

const matchups = new MatchupService(createProvider(config, fetchJson), dd, new TtlCache(6 * 60 * 60 * 1000), config.minGames);
createApp({ champions: dd, matchups }).listen(config.port, () => {
  console.log(`API on http://localhost:${config.port} (provider: ${config.provider})`);
});
```

- [ ] **Step 4: Run** `npm test -w server && npm run typecheck -w server` → PASS, clean.
- [ ] **Step 5: Live check** — `cp .env.example .env`, `npm run dev:server`, then `curl "http://localhost:3001/api/matchup?champ=darius&lane=top"` → 5 counters with names, build with items. Stop the server.
- [ ] **Step 6: Stage** — `git add -A` (verify `.env` is NOT staged: `git status --short | grep .env` shows only `.env.example`).

---

### Task 7: React web app

**Files:** Replace `web/package.json`; create `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/style.css`, `web/src/components/ChampionPicker.tsx`, `LanePicker.tsx`, `CounterList.tsx`, `BuildPanel.tsx`, `web/src/components/CounterList.test.tsx`.

**Interfaces:**
- Consumes: shared types (Task 1); API routes (Task 6).
- Produces (`web/src/api.ts`):
```ts
export function fetchChampions(): Promise<Champion[]>;
export function fetchMatchup(champ: string, lane: Lane): Promise<MatchupResponse>;
export function fetchBuild(champ: string, lane: Lane, vs: string): Promise<BuildResponse>;
// all throw Error(body.error ?? 'Request failed')
```
Components:
- `ChampionPicker({ champions, onChange })` — uncontrolled `<input list>` + `<datalist>`; `onChange(id | null)` when text matches a champion name (case-insensitive).
- `LanePicker({ value, onChange })` — 5 buttons, active one has `aria-pressed`.
- `CounterList({ counters, selected, onSelect })` — list; empty → "No counters with enough games".
- `BuildPanel({ title, build })` — `build === null` → "Not enough data for this matchup".

- [ ] **Step 1: Package files**

`web/package.json`:
```json
{
  "name": "@lol/web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "test": "vitest run", "typecheck": "tsc -p ." },
  "dependencies": { "@lol/shared": "*", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0", "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0", "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^25.0.0", "typescript": "^5.6.0", "vite": "^7.0.0", "vitest": "^3.0.0"
  }
}
```
`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM"], "types": ["vitest/globals", "@testing-library/jest-dom"] },
  "include": ["src", "vite.config.ts"]
}
```
`web/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['@testing-library/jest-dom/vitest'] },
});
```
`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>LoL Matchups</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```
Run: `npm install`.

- [ ] **Step 2: Failing test** — `web/src/components/CounterList.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import type { Counter } from '@lol/shared';
import { CounterList } from './CounterList';

const counters: Counter[] = [
  { champion: { id: 'MonkeyKing', key: 62, name: 'Wukong', icon: 'w.png' }, winRate: 46.18, games: 2984 },
  { champion: { id: 'DrMundo', key: 36, name: 'Dr. Mundo', icon: 'm.png' }, winRate: 46.65, games: 9092 },
];

describe('CounterList', () => {
  it('shows name, win rate and games', () => {
    render(<CounterList counters={counters} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('Wukong')).toBeInTheDocument();
    expect(screen.getByText('46.18% WR')).toBeInTheDocument();
    expect(screen.getByText('2,984 games')).toBeInTheDocument();
  });

  it('selects a counter on click', () => {
    const onSelect = vi.fn();
    render(<CounterList counters={counters} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Dr. Mundo'));
    expect(onSelect).toHaveBeenCalledWith('DrMundo');
  });

  it('shows empty state', () => {
    render(<CounterList counters={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('No counters with enough games')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run** `npm test -w web` → FAIL.

- [ ] **Step 4: Implement components**

`web/src/components/CounterList.tsx`:
```tsx
import type { Counter } from '@lol/shared';

interface Props { counters: Counter[]; selected: string | null; onSelect(id: string): void }

export function CounterList({ counters, selected, onSelect }: Props) {
  if (counters.length === 0) return <p className="muted">No counters with enough games</p>;
  return (
    <ol className="counters">
      {counters.map(({ champion, winRate, games }) => (
        <li key={champion.id}>
          <button className={selected === champion.id ? 'counter active' : 'counter'} onClick={() => onSelect(champion.id)}>
            <img src={champion.icon} alt="" width={40} height={40} />
            <span className="name">{champion.name}</span>
            <span className="wr">{winRate.toFixed(2)}% WR</span>
            <span className="muted">{games.toLocaleString('en-GB')} games</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
```
`web/src/components/BuildPanel.tsx`:
```tsx
import type { Build, Item } from '@lol/shared';

const Items = ({ items }: { items: Item[] }) => (
  <div className="items">{items.map((i) => <img key={i.id} src={i.icon} alt={i.name} title={i.name} width={36} height={36} />)}</div>
);

export function BuildPanel({ title, build }: { title: string; build: Build | null }) {
  return (
    <section className="build">
      <h2>{title}</h2>
      {!build ? (
        <p className="muted">Not enough data for this matchup</p>
      ) : (
        <>
          <p className="muted">{build.winRate.toFixed(2)}% WR · {build.games.toLocaleString('en-GB')} games</p>
          <h3>Early items</h3><Items items={build.early} />
          <h3>Core items</h3><Items items={build.core} />
          <h3>Boots</h3>{build.boots ? <Items items={[build.boots]} /> : <p className="muted">No data</p>}
        </>
      )}
    </section>
  );
}
```
`web/src/components/LanePicker.tsx`:
```tsx
import { LANES, type Lane } from '@lol/shared';

export function LanePicker({ value, onChange }: { value: Lane; onChange(l: Lane): void }) {
  return (
    <div className="lanes" role="group" aria-label="Lane">
      {LANES.map((l) => (
        <button key={l} aria-pressed={l === value} onClick={() => onChange(l)}>{l}</button>
      ))}
    </div>
  );
}
```
`web/src/components/ChampionPicker.tsx`:
```tsx
import type { Champion } from '@lol/shared';

interface Props { champions: Champion[]; onChange(id: string | null): void }

export function ChampionPicker({ champions, onChange }: Props) {
  return (
    <>
      <input
        list="champions"
        placeholder="Champion…"
        aria-label="Champion"
        onChange={(e) => {
          const name = e.target.value.toLowerCase();
          onChange(champions.find((c) => c.name.toLowerCase() === name)?.id ?? null);
        }}
      />
      <datalist id="champions">{champions.map((c) => <option key={c.id} value={c.name} />)}</datalist>
    </>
  );
}
```
`web/src/api.ts`:
```ts
import type { BuildResponse, Champion, Lane, MatchupResponse } from '@lol/shared';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Request failed');
  return body as T;
}

export const fetchChampions = () => get<Champion[]>('/api/champions');
export const fetchMatchup = (champ: string, lane: Lane) =>
  get<MatchupResponse>(`/api/matchup?${new URLSearchParams({ champ, lane })}`);
export const fetchBuild = (champ: string, lane: Lane, vs: string) =>
  get<BuildResponse>(`/api/build?${new URLSearchParams({ champ, lane, vs })}`);
```
`web/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import type { Build, Champion, Lane, MatchupResponse } from '@lol/shared';
import { fetchBuild, fetchChampions, fetchMatchup } from './api';
import { ChampionPicker } from './components/ChampionPicker';
import { LanePicker } from './components/LanePicker';
import { CounterList } from './components/CounterList';
import { BuildPanel } from './components/BuildPanel';

export function App() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [champ, setChamp] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane>('top');
  const [result, setResult] = useState<MatchupResponse | null>(null);
  const [vs, setVs] = useState<string | null>(null);
  const [vsBuild, setVsBuild] = useState<Build | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchChampions().then(setChampions).catch((e) => setError(e.message)); }, []);

  async function search() {
    if (!champ) return;
    setLoading(true); setError(null); setVs(null); setVsBuild(undefined);
    try { setResult(await fetchMatchup(champ, lane)); }
    catch (e) { setResult(null); setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function selectCounter(id: string) {
    if (!result) return;
    setVs(id); setVsBuild(undefined);
    try { setVsBuild((await fetchBuild(result.champion.id, result.lane, id)).build); }
    catch (e) { setError((e as Error).message); }
  }

  const vsName = result?.counters.find((c) => c.champion.id === vs)?.champion.name;

  return (
    <main>
      <h1>LoL Matchups <small>EUW · Platinum</small></h1>
      <div className="search">
        <ChampionPicker champions={champions} onChange={setChamp} />
        <LanePicker value={lane} onChange={setLane} />
        <button onClick={search} disabled={!champ || loading}>{loading ? 'Loading…' : 'Search'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="results">
          <section>
            <h2>Top 5 counters — {result.champion.name} {result.lane}</h2>
            <CounterList counters={result.counters} selected={vs} onSelect={selectCounter} />
          </section>
          <BuildPanel title="Recommended build" build={result.build} />
          {vs && vsBuild !== undefined && <BuildPanel title={`vs ${vsName}`} build={vsBuild} />}
        </div>
      )}
    </main>
  );
}
```
`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```
`web/src/style.css`:
```css
:root { color-scheme: light dark; --bg: #f6f7f9; --fg: #1b1d22; --muted: #6b7280; --card: #fff; --accent: #c89b3c; --bad: #c0392b; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1115; --fg: #e5e7eb; --muted: #9ca3af; --card: #181b21; } }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
main { max-width: 960px; margin: 0 auto; padding: 16px; }
h1 small { font-size: 0.5em; color: var(--muted); }
.search { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
input, button { font: inherit; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--muted); background: var(--card); color: var(--fg); }
.lanes button[aria-pressed='true'], .counter.active { border-color: var(--accent); outline: 2px solid var(--accent); }
.results { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 16px; }
.counters { list-style: none; padding: 0; display: grid; gap: 8px; }
.counter { width: 100%; display: grid; grid-template-columns: 40px 1fr auto; grid-template-rows: auto auto; gap: 0 12px; text-align: left; cursor: pointer; }
.counter img { grid-row: span 2; border-radius: 4px; }
.wr { color: var(--bad); font-weight: 600; }
.items { display: flex; gap: 6px; flex-wrap: wrap; }
.items img { border-radius: 4px; }
.muted { color: var(--muted); }
.error { color: var(--bad); }
```

- [ ] **Step 5: Run** `npm test -w web && npm run typecheck -w web` → PASS, clean.
- [ ] **Step 6: Stage** — `git add -A`

---

### Task 8: README + end-to-end check

**Files:** Create `README.md`.

- [ ] **Step 1: README**
```markdown
# LoL Matchups (private)

Pick a champion + lane → top 5 counters and recommended build (EUW, Platinum).

## Run
    cp .env.example .env
    npm install
    npm run dev:server   # API on :3001
    npm run dev:web      # site on http://localhost:5173

## Data
- Counters/builds: lolalytics (unofficial endpoints, may break) — `PROVIDER=lolalytics`.
- Names/icons: Riot Data Dragon.
- `PROVIDER=riot` reserved for the future Riot API match crawler (not implemented).
- `MIN_GAMES` (default 1000) hides low-sample matchups.

## Test
    npm test
```

- [ ] **Step 2: Full test + typecheck** — `npm test && npm run typecheck` → all PASS.
- [ ] **Step 3: Manual E2E** — run both dev servers; in the browser: Darius + top → 5 counters with icons, build shows early/core/boots; click a counter → "Not enough data for this matchup"; Wukong + jungle → results; stop the API server and search → "Request failed"/"Data source unavailable" message shown.
- [ ] **Step 4: Stage** — `git add -A`. Ask the user whether to commit.
