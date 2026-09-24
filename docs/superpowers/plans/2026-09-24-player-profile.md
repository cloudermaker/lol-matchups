# Player Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enter a Riot ID (`Name#TAG`) and get the player's last 50 ranked Solo/Duo games as a champion pool table, stats against lane opponents, and short advice.

**Architecture:** A `RiotClient` (rate-limited, EUW routing) feeds a disk `MatchStore` (one JSON file per match). Pure functions in `server/src/profile/` aggregate the matches and build advice. A `ProfileService` orchestrates them and reuses the existing `MatchupService` for lolalytics counters and core builds. The web app gets a `?player=` route and a `PlayerPage` component.

**Tech Stack:** TypeScript npm workspaces; Express 5 + vitest + supertest (server); React 19 + Vite + Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-09-24-player-profile-design.md`

## Global Constraints

- Region EUW only: `europe` routing for account-v1 and match-v5, `euw1` for league-v4.
- Queue 420 (Ranked Solo/Duo), last 50 games.
- Rate limits: 20 requests per 1 s and 100 per 120 s.
- Remake = `gameDuration < 300` seconds or any `gameEndedInEarlySurrender`.
- Benchmarks need 3+ games; picks 5+ games; counters 2+ games; "low" win rate = ≤ 40 %; off-role shown at ≥ 20 %; ±10 % colour threshold; max 6 advice lines.
- Tier mapping: Emerald and above → `emerald_plus`; Platinum → `platinum_plus`; everything else or unranked → `gold_plus`.
- No new dependencies.
- No test calls the real Riot API.
- **Do not commit.** The user commits only on request. Each task ends by running the tests.
- Code comments: one short line, only where useful.

## Review Focus

1. **Riot IDs with spaces or accents** (`Mr Noodle#EUW`, `Éric#FR1`) must round-trip web URL → API path → Riot URL. Tests: Task 2 (client encodes), Task 7 (route decodes `%20`), Task 9 (search with a space).
2. **Riot ID case** (`me#euw` vs `Me#EUW`) must hit the same cache entry and display Riot's canonical name. Test: Task 6.
3. **A champion missing from Data Dragon** (released after the server started, since Data Dragon isn't refreshed) must not crash the profile. Test: Task 6.
4. **A game with no matching lane opponent** (the enemy position is empty) must stay in the pool without breaking the benchmarks. Test: Task 4.
5. **One match returning 404** mid-list must be skipped, not reported as "No EUW account". Test: Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `shared/src/types.ts` (modify) | `StatLine`, `PoolEntry`, `Advice`, `Rank`, `ProfileResponse` |
| `server/src/riot/rateLimiter.ts` | Sliding-window limiter |
| `server/src/riot/types.ts` | Raw Riot API shapes |
| `server/src/riot/client.ts` | `RiotClient`, `RiotError` |
| `server/src/riot/matchStore.ts` | Disk cache of matches |
| `server/src/profile/aggregate.ts` | Matches → games → pool rows; main lane; tier mapping |
| `server/src/profile/advice.ts` | Advice rules |
| `server/src/profile/service.ts` | `ProfileService` orchestration |
| `server/src/app.ts`, `server/src/server.ts` (modify) | Route and wiring |
| `web/src/riotId.ts` | `parseRiotId` |
| `web/src/api.ts` (modify) | `fetchProfile` |
| `web/src/components/PlayerPage.tsx` | Player page UI |
| `web/src/App.tsx`, `web/src/style.css` (modify) | Routing, search, styles |

---

### Task 1: Rate limiter

**Files:**
- Create: `server/src/riot/rateLimiter.ts`
- Test: `server/test/rateLimiter.test.ts`

**Interfaces:**
- Produces: `RateLimiter(windows: RateWindow[], now?: () => number, sleep?: Sleep)` with `acquire(): Promise<void>`; `type Sleep = (ms: number) => Promise<void>`; `realSleep: Sleep`; `interface RateWindow { limit: number; windowMs: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/rateLimiter.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- rateLimiter`
Expected: FAIL, cannot resolve `../src/riot/rateLimiter`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/riot/rateLimiter.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w server -- rateLimiter`
Expected: 3 tests PASS.

---

### Task 2: Riot client

**Files:**
- Create: `server/src/riot/types.ts`, `server/src/riot/client.ts`
- Test: `server/test/riotClient.test.ts`

**Interfaces:**
- Consumes: `RateLimiter`, `Sleep`, `realSleep` (Task 1).
- Produces:
  - `RiotAccount { puuid; gameName; tagLine }`, `RiotLeagueEntry { queueType; tier; rank; leaguePoints }`, `RiotParticipant`, `RiotMatch` (below).
  - `class RiotError extends Error { kind: 'not_found' | 'key' | 'busy' | 'http' }`.
  - `RiotClient(apiKey?: string, fetchFn?: RiotFetch, limiter?: RateLimiter, sleep?: Sleep)` with `account(gameName, tagLine): Promise<RiotAccount>`, `matchIds(puuid, count): Promise<string[]>`, `match(id): Promise<RiotMatch>`, `leagueEntries(puuid): Promise<RiotLeagueEntry[]>`.

- [ ] **Step 1: Write the Riot types**

```ts
// server/src/riot/types.ts
export interface RiotAccount { puuid: string; gameName: string; tagLine: string }
export interface RiotLeagueEntry { queueType: string; tier: string; rank: string; leaguePoints: number }
export interface RiotParticipant {
  puuid: string; championId: number; teamId: number; teamPosition: string; win: boolean;
  kills: number; deaths: number; assists: number;
  totalMinionsKilled: number; neutralMinionsKilled: number; visionScore: number;
  totalDamageDealtToChampions: number; goldEarned: number;
  item0: number; item1: number; item2: number; item3: number; item4: number; item5: number;
  gameEndedInEarlySurrender: boolean;
}
// gameDuration is in seconds
export interface RiotMatch { metadata: { matchId: string }; info: { gameDuration: number; queueId: number; participants: RiotParticipant[] } }
```

- [ ] **Step 2: Write the failing test**

```ts
// server/test/riotClient.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RiotClient, RiotError, type RiotFetch, type RiotResponse } from '../src/riot/client';
import { RateLimiter } from '../src/riot/rateLimiter';

const ok = (body: unknown): RiotResponse => ({ status: 200, headers: { get: () => null }, json: async () => body });
const status = (code: number, retryAfter?: string): RiotResponse => ({
  status: code, headers: { get: (n) => (n === 'Retry-After' ? (retryAfter ?? null) : null) }, json: async () => ({}),
});

function setup(responses: RiotResponse[], key: string | undefined = 'k') {
  const fetchFn = vi.fn<RiotFetch>();
  for (const r of responses) fetchFn.mockResolvedValueOnce(r);
  const sleep = vi.fn(async (_ms: number) => {});
  const client = new RiotClient(key, fetchFn, new RateLimiter([{ limit: 1000, windowMs: 1 }]), sleep);
  return { client, fetchFn, sleep };
}

const kind = (p: Promise<unknown>) => p.then(() => 'resolved', (e) => (e instanceof RiotError ? e.kind : 'other'));

describe('RiotClient', () => {
  it('looks up an account on the europe route with the key', async () => {
    const { client, fetchFn } = setup([ok({ puuid: 'p', gameName: 'Mr Noodle', tagLine: 'EUW' })]);
    expect(await client.account('Mr Noodle', 'EUW')).toEqual({ puuid: 'p', gameName: 'Mr Noodle', tagLine: 'EUW' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Mr%20Noodle/EUW',
      { headers: { 'X-Riot-Token': 'k' } },
    );
  });

  it('asks for ranked Solo/Duo match ids', async () => {
    const { client, fetchFn } = setup([ok(['EUW1_1'])]);
    expect(await client.matchIds('p', 50)).toEqual(['EUW1_1']);
    expect(fetchFn.mock.calls[0][0]).toBe('https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/p/ids?queue=420&count=50');
  });

  it('reads league entries on the euw1 route', async () => {
    const { client, fetchFn } = setup([ok([])]);
    await client.leagueEntries('p');
    expect(fetchFn.mock.calls[0][0]).toBe('https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/p');
  });

  it('maps 404 to not_found', async () => {
    expect(await kind(setup([status(404)]).client.account('a', 'b'))).toBe('not_found');
  });

  it('maps 401 and 403 to key', async () => {
    expect(await kind(setup([status(401)]).client.account('a', 'b'))).toBe('key');
    expect(await kind(setup([status(403)]).client.account('a', 'b'))).toBe('key');
  });

  it('fails with key when no key is set, without calling Riot', async () => {
    const { client, fetchFn } = setup([], undefined);
    expect(await kind(client.account('a', 'b'))).toBe('key');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('waits Retry-After and retries once on 429', async () => {
    const { client, sleep } = setup([status(429, '2'), ok(['EUW1_1'])]);
    expect(await client.matchIds('p', 50)).toEqual(['EUW1_1']);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('fails with busy after a second 429', async () => {
    expect(await kind(setup([status(429), status(429)]).client.matchIds('p', 50))).toBe('busy');
  });

  it('maps other errors to http', async () => {
    expect(await kind(setup([status(500)]).client.match('EUW1_1'))).toBe('http');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w server -- riotClient`
Expected: FAIL, cannot resolve `../src/riot/client`.

- [ ] **Step 4: Write the implementation**

```ts
// server/src/riot/client.ts
import { RateLimiter, realSleep, type Sleep } from './rateLimiter';
import type { RiotAccount, RiotLeagueEntry, RiotMatch } from './types';

const REGION = 'https://europe.api.riotgames.com';
const PLATFORM = 'https://euw1.api.riotgames.com';
const RANKED_SOLO = 420;

export type RiotErrorKind = 'not_found' | 'key' | 'busy' | 'http';
export class RiotError extends Error {
  constructor(public kind: RiotErrorKind, message: string) { super(message); }
}

export interface RiotResponse { status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }
export type RiotFetch = (url: string, init: { headers: Record<string, string> }) => Promise<RiotResponse>;

// personal key limits
const personalKeyLimiter = () => new RateLimiter([{ limit: 20, windowMs: 1000 }, { limit: 100, windowMs: 120_000 }]);

export class RiotClient {
  constructor(
    private apiKey: string | undefined,
    private fetchFn: RiotFetch = fetch,
    private limiter: RateLimiter = personalKeyLimiter(),
    private sleep: Sleep = realSleep,
  ) {}

  account(gameName: string, tagLine: string): Promise<RiotAccount> {
    return this.get(`${REGION}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`) as Promise<RiotAccount>;
  }

  matchIds(puuid: string, count: number): Promise<string[]> {
    return this.get(`${REGION}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO}&count=${count}`) as Promise<string[]>;
  }

  match(id: string): Promise<RiotMatch> {
    return this.get(`${REGION}/lol/match/v5/matches/${id}`) as Promise<RiotMatch>;
  }

  leagueEntries(puuid: string): Promise<RiotLeagueEntry[]> {
    return this.get(`${PLATFORM}/lol/league/v4/entries/by-puuid/${puuid}`) as Promise<RiotLeagueEntry[]>;
  }

  private async get(url: string, retried = false): Promise<unknown> {
    if (!this.apiKey) throw new RiotError('key', 'Riot API key missing or expired');
    await this.limiter.acquire();
    const res = await this.fetchFn(url, { headers: { 'X-Riot-Token': this.apiKey } });
    if (res.status === 429) {
      if (retried) throw new RiotError('busy', 'Riot API busy, try again in a minute');
      const seconds = Number(res.headers.get('Retry-After'));
      await this.sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      return this.get(url, true);
    }
    if (res.status === 404) throw new RiotError('not_found', 'Not found');
    if (res.status === 401 || res.status === 403) throw new RiotError('key', 'Riot API key missing or expired');
    if (res.status < 200 || res.status >= 300) throw new RiotError('http', `Riot API HTTP ${res.status}`);
    return res.json();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w server -- riotClient`
Expected: 9 tests PASS.

---

### Task 3: Match store

**Files:**
- Create: `server/src/riot/matchStore.ts`
- Modify: `.gitignore` (add `server/data/`)
- Test: `server/test/matchStore.test.ts`

**Interfaces:**
- Consumes: `RiotMatch` (Task 2).
- Produces: `MatchStore(dir: string, fetchMatch: (id: string) => Promise<RiotMatch>)` with `get(id: string): Promise<RiotMatch>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/matchStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchStore } from '../src/riot/matchStore';
import type { RiotMatch } from '../src/riot/types';

const match = (id: string): RiotMatch => ({ metadata: { matchId: id }, info: { gameDuration: 1800, queueId: 420, participants: [] } });
let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'matches-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('MatchStore', () => {
  it('fetches a missing match and writes it to disk', async () => {
    const fetchMatch = vi.fn(async (id: string) => match(id));
    const store = new MatchStore(join(dir, 'nested'), fetchMatch);
    expect(await store.get('EUW1_1')).toEqual(match('EUW1_1'));
    expect(JSON.parse(await readFile(join(dir, 'nested', 'EUW1_1.json'), 'utf8'))).toEqual(match('EUW1_1'));
  });

  it('reads a cached match without fetching', async () => {
    await writeFile(join(dir, 'EUW1_2.json'), JSON.stringify(match('EUW1_2')));
    const fetchMatch = vi.fn(async (id: string) => match(id));
    expect(await new MatchStore(dir, fetchMatch).get('EUW1_2')).toEqual(match('EUW1_2'));
    expect(fetchMatch).not.toHaveBeenCalled();
  });

  it('replaces a corrupt file', async () => {
    await writeFile(join(dir, 'EUW1_3.json'), '{not json');
    const fetchMatch = vi.fn(async (id: string) => match(id));
    expect(await new MatchStore(dir, fetchMatch).get('EUW1_3')).toEqual(match('EUW1_3'));
    expect(fetchMatch).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(join(dir, 'EUW1_3.json'), 'utf8'))).toEqual(match('EUW1_3'));
  });

  it('rejects ids that are not Riot match ids', async () => {
    const store = new MatchStore(dir, vi.fn());
    await expect(store.get('../secret')).rejects.toThrow('Invalid match id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- matchStore`
Expected: FAIL, cannot resolve `../src/riot/matchStore`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/riot/matchStore.ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RiotMatch } from './types';

const MATCH_ID = /^[A-Z0-9]+_\d+$/;

// finished matches never change, so they are kept forever
export class MatchStore {
  constructor(private dir: string, private fetchMatch: (id: string) => Promise<RiotMatch>) {}

  async get(id: string): Promise<RiotMatch> {
    if (!MATCH_ID.test(id)) throw new Error(`Invalid match id: ${id}`);
    const file = join(this.dir, `${id}.json`);
    const cached = await this.read(file);
    if (cached) return cached;
    const match = await this.fetchMatch(id);
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, JSON.stringify(match));
    return match;
  }

  private async read(file: string): Promise<RiotMatch | null> {
    let text: string;
    try { text = await readFile(file, 'utf8'); } catch { return null; }
    try { return JSON.parse(text) as RiotMatch; } catch { await rm(file, { force: true }); return null; }
  }
}
```

- [ ] **Step 4: Ignore the data folder**

Append this line to `.gitignore`:

```
server/data/
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w server -- matchStore`
Expected: 4 tests PASS.

---

### Task 4: Aggregation and shared types

**Files:**
- Modify: `shared/src/types.ts` (append types)
- Create: `server/src/profile/aggregate.ts`, `server/test/fixtures/riot.ts`
- Test: `server/test/aggregate.test.ts`

**Interfaces:**
- Consumes: `RiotMatch`, `RiotParticipant` (Task 2).
- Produces:
  - Shared: `StatLine`, `PoolEntry`, `AdviceKind`, `Advice`, `Rank`, `ProfileResponse` (below).
  - `PlayedGame`, `PoolRow`, `MIN_BENCHMARK_GAMES = 3`, `isRemake(m)`, `statLine(p, minutes)`, `toGames(puuid, matches): PlayedGame[]`, `average(lines)`, `buildPool(games): PoolRow[]`, `mainLane(games): Lane | null`, `tierForRank(tier?: string): Tier`.
  - Fixtures: `participant(o?)`, `match(id, participants, duration?)`, `laneGame(id, o)`.

- [ ] **Step 1: Append the shared types**

Append to `shared/src/types.ts`:

```ts
export interface StatLine { csPerMin: number; deaths: number; visionPerMin: number; damagePerMin: number; goldPerMin: number }
// you/opponents are null below 3 games on this champion and lane
export interface PoolEntry {
  champion: Champion; lane: Lane; games: number; wins: number; winRate: number; kda: number;
  you: StatLine | null; opponents: StatLine | null;
}
export type AdviceKind = 'best' | 'struggling' | 'offrole' | 'counter' | 'build';
export interface Advice { kind: AdviceKind; text: string }
export interface Rank { tier: string; division: string; lp: number }
export interface ProfileResponse {
  riotId: string; rank: Rank | null; tier: Tier; games: number; winRate: number; mainLane: Lane | null;
  pool: PoolEntry[]; advice: Advice[]; lolalyticsAvailable: boolean;
}
```

- [ ] **Step 2: Write the fixtures**

```ts
// server/test/fixtures/riot.ts
import type { RiotMatch, RiotParticipant } from '../../src/riot/types';

export function participant(o: Partial<RiotParticipant> = {}): RiotParticipant {
  return {
    puuid: 'other', championId: 1, teamId: 100, teamPosition: 'TOP', win: false,
    kills: 0, deaths: 0, assists: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0, visionScore: 0,
    totalDamageDealtToChampions: 0, goldEarned: 0,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, gameEndedInEarlySurrender: false,
    ...o,
  };
}

export function match(id: string, participants: RiotParticipant[], gameDuration = 1800): RiotMatch {
  return { metadata: { matchId: id }, info: { gameDuration, queueId: 420, participants } };
}

interface LaneGame { champ: number; opp: number; lane?: string; win?: boolean; me?: Partial<RiotParticipant>; them?: Partial<RiotParticipant>; duration?: number }

// "me" against one lane opponent
export function laneGame(id: string, o: LaneGame): RiotMatch {
  const lane = o.lane ?? 'TOP';
  const win = o.win ?? true;
  return match(id, [
    participant({ puuid: 'me', championId: o.champ, teamId: 100, teamPosition: lane, win, ...o.me }),
    participant({ puuid: 'opp', championId: o.opp, teamId: 200, teamPosition: lane, win: !win, ...o.them }),
  ], o.duration);
}
```

- [ ] **Step 3: Write the failing test**

```ts
// server/test/aggregate.test.ts
import { describe, it, expect } from 'vitest';
import { buildPool, mainLane, statLine, tierForRank, toGames } from '../src/profile/aggregate';
import { laneGame, match, participant } from './fixtures/riot';

describe('statLine', () => {
  it('computes per-minute stats', () => {
    const p = participant({ totalMinionsKilled: 150, neutralMinionsKilled: 30, deaths: 4, visionScore: 30, totalDamageDealtToChampions: 15000, goldEarned: 12000 });
    expect(statLine(p, 30)).toEqual({ csPerMin: 6, deaths: 4, visionPerMin: 1, damagePerMin: 500, goldPerMin: 400 });
  });
});

describe('toGames', () => {
  it('pairs me with the enemy in the same position', () => {
    const [g] = toGames('me', [laneGame('EUW1_1', { champ: 1, opp: 2, win: false, me: { kills: 3, item0: 3071 } })]);
    expect(g).toMatchObject({ championKey: 1, lane: 'top', win: false, kills: 3, items: [3071] });
    expect(g.opponent?.championKey).toBe(2);
  });

  it('skips short games and early surrenders', () => {
    const games = toGames('me', [
      laneGame('EUW1_1', { champ: 1, opp: 2, duration: 299 }),
      laneGame('EUW1_2', { champ: 1, opp: 2, them: { gameEndedInEarlySurrender: true } }),
      laneGame('EUW1_3', { champ: 1, opp: 2, duration: 300 }),
    ]);
    expect(games).toHaveLength(1);
  });

  it('keeps a game with no position but without lane or opponent', () => {
    const [g] = toGames('me', [laneGame('EUW1_1', { champ: 1, opp: 2, lane: '' })]);
    expect(g.lane).toBeNull();
    expect(g.opponent).toBeNull();
  });

  it('keeps a laned game when the enemy position is missing', () => {
    const m = match('EUW1_1', [participant({ puuid: 'me', teamPosition: 'MIDDLE' }), participant({ teamId: 200, teamPosition: '' })]);
    const [g] = toGames('me', [m]);
    expect(g.lane).toBe('middle');
    expect(g.opponent).toBeNull();
  });

  it('ignores matches I am not in', () => {
    expect(toGames('someone', [laneGame('EUW1_1', { champ: 1, opp: 2 })])).toEqual([]);
  });
});

describe('buildPool', () => {
  const games = toGames('me', [
    laneGame('EUW1_1', { champ: 1, opp: 2, win: true, me: { kills: 4, assists: 2, deaths: 2, goldEarned: 12000 }, them: { goldEarned: 9000 } }),
    laneGame('EUW1_2', { champ: 1, opp: 2, win: false, me: { deaths: 1, goldEarned: 12000 }, them: { goldEarned: 9000 } }),
    laneGame('EUW1_3', { champ: 1, opp: 3, win: true, me: { goldEarned: 12000 }, them: { goldEarned: 9000 } }),
    laneGame('EUW1_4', { champ: 5, opp: 2, lane: 'JUNGLE' }),
    laneGame('EUW1_5', { champ: 5, opp: 2, lane: '' }),
  ]);

  it('groups by champion and lane, sorted by games', () => {
    const pool = buildPool(games);
    expect(pool.map((r) => [r.championKey, r.lane, r.games, r.wins])).toEqual([[1, 'top', 3, 2], [5, 'jungle', 1, 1]]);
    expect(pool[0].kda).toBe(2);
  });

  it('benchmarks only rows with 3+ games', () => {
    const [top, jungle] = buildPool(games);
    expect(top.you?.goldPerMin).toBe(400);
    expect(top.opponents?.goldPerMin).toBe(300);
    expect(jungle.you).toBeNull();
    expect(jungle.opponents).toBeNull();
  });

  it('does not benchmark games without an opponent', () => {
    const noOpp = match('EUW1_9', [participant({ puuid: 'me', championId: 1 })]);
    const pool = buildPool(toGames('me', [laneGame('EUW1_1', { champ: 1, opp: 2 }), laneGame('EUW1_2', { champ: 1, opp: 2 }), noOpp]));
    expect(pool[0].games).toBe(3);
    expect(pool[0].you).toBeNull();
  });
});

describe('mainLane', () => {
  it('is the most-played lane', () => {
    const games = toGames('me', [
      laneGame('EUW1_1', { champ: 1, opp: 2, lane: 'JUNGLE' }),
      laneGame('EUW1_2', { champ: 1, opp: 2, lane: 'UTILITY' }),
      laneGame('EUW1_3', { champ: 1, opp: 2, lane: 'UTILITY' }),
    ]);
    expect(mainLane(games)).toBe('support');
    expect(mainLane([])).toBeNull();
  });
});

describe('tierForRank', () => {
  it('maps ranks to lolalytics tiers', () => {
    expect(tierForRank('CHALLENGER')).toBe('emerald_plus');
    expect(tierForRank('EMERALD')).toBe('emerald_plus');
    expect(tierForRank('PLATINUM')).toBe('platinum_plus');
    expect(tierForRank('GOLD')).toBe('gold_plus');
    expect(tierForRank('IRON')).toBe('gold_plus');
    expect(tierForRank(undefined)).toBe('gold_plus');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -w server -- aggregate`
Expected: FAIL, cannot resolve `../src/profile/aggregate`.

- [ ] **Step 5: Write the implementation**

```ts
// server/src/profile/aggregate.ts
import type { Lane, StatLine, Tier } from '@lol/shared';
import type { RiotMatch, RiotParticipant } from '../riot/types';

const POSITION_LANES: Record<string, Lane> = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'support' };
const REMAKE_SECONDS = 300;
const EMERALD_UP = ['EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
export const MIN_BENCHMARK_GAMES = 3;

export interface PlayedGame {
  championKey: number; lane: Lane | null; win: boolean;
  kills: number; deaths: number; assists: number; items: number[];
  you: StatLine; opponent: { championKey: number; stats: StatLine } | null;
}
export interface PoolRow {
  championKey: number; lane: Lane; games: number; wins: number; kda: number;
  you: StatLine | null; opponents: StatLine | null;
}

export function isRemake(m: RiotMatch): boolean {
  return m.info.gameDuration < REMAKE_SECONDS || m.info.participants.some((p) => p.gameEndedInEarlySurrender);
}

export function statLine(p: RiotParticipant, minutes: number): StatLine {
  return {
    csPerMin: (p.totalMinionsKilled + p.neutralMinionsKilled) / minutes,
    deaths: p.deaths,
    visionPerMin: p.visionScore / minutes,
    damagePerMin: p.totalDamageDealtToChampions / minutes,
    goldPerMin: p.goldEarned / minutes,
  };
}

export function toGames(puuid: string, matches: RiotMatch[]): PlayedGame[] {
  return matches.flatMap((m) => {
    const me = m.info.participants.find((p) => p.puuid === puuid);
    if (!me || isRemake(m)) return [];
    const minutes = m.info.gameDuration / 60;
    const lane = POSITION_LANES[me.teamPosition] ?? null;
    const opp = lane ? m.info.participants.find((p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition) : undefined;
    return [{
      championKey: me.championId, lane, win: me.win,
      kills: me.kills, deaths: me.deaths, assists: me.assists,
      items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5].filter((id) => id > 0),
      you: statLine(me, minutes),
      opponent: opp ? { championKey: opp.championId, stats: statLine(opp, minutes) } : null,
    }];
  });
}

export function average(lines: StatLine[]): StatLine {
  const mean = (k: keyof StatLine) => lines.reduce((sum, l) => sum + l[k], 0) / lines.length;
  return { csPerMin: mean('csPerMin'), deaths: mean('deaths'), visionPerMin: mean('visionPerMin'), damagePerMin: mean('damagePerMin'), goldPerMin: mean('goldPerMin') };
}

export function buildPool(games: PlayedGame[]): PoolRow[] {
  const groups = new Map<string, PlayedGame[]>();
  for (const g of games) {
    if (!g.lane) continue;
    const key = `${g.championKey}:${g.lane}`;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return [...groups.values()]
    .map((list): PoolRow => {
      const deaths = list.reduce((sum, g) => sum + g.deaths, 0);
      const takedowns = list.reduce((sum, g) => sum + g.kills + g.assists, 0);
      const paired = list.flatMap((g) => (g.opponent ? [{ you: g.you, them: g.opponent.stats }] : []));
      const enough = paired.length >= MIN_BENCHMARK_GAMES;
      return {
        championKey: list[0].championKey, lane: list[0].lane as Lane,
        games: list.length, wins: list.filter((g) => g.win).length,
        kda: takedowns / Math.max(1, deaths),
        you: enough ? average(paired.map((p) => p.you)) : null,
        opponents: enough ? average(paired.map((p) => p.them)) : null,
      };
    })
    .sort((a, b) => b.games - a.games);
}

export function mainLane(games: PlayedGame[]): Lane | null {
  const counts = new Map<Lane, number>();
  for (const g of games) if (g.lane) counts.set(g.lane, (counts.get(g.lane) ?? 0) + 1);
  let best: Lane | null = null;
  for (const [lane, n] of counts) if (!best || n > counts.get(best)!) best = lane;
  return best;
}

export function tierForRank(rankTier: string | undefined): Tier {
  if (rankTier && EMERALD_UP.includes(rankTier)) return 'emerald_plus';
  if (rankTier === 'PLATINUM') return 'platinum_plus';
  return 'gold_plus';
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w server -- aggregate`
Expected: all aggregate tests PASS.

---

### Task 5: Advice rules

**Files:**
- Create: `server/src/profile/advice.ts`
- Test: `server/test/advice.test.ts`

**Interfaces:**
- Consumes: `PlayedGame`, `PoolRow`, `MIN_BENCHMARK_GAMES`, `buildPool`, `mainLane` (Task 4); `Advice` (shared).
- Produces: `LaneData { counterKeys: number[]; coreItems: number[] }`, `AdviceInput`, `laneKey(championKey, lane): string`, `buildAdvice(input): Advice[]`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/advice.test.ts
import { describe, it, expect } from 'vitest';
import type { StatLine } from '@lol/shared';
import { buildAdvice, type LaneData } from '../src/profile/advice';
import { buildPool, mainLane, type PlayedGame } from '../src/profile/aggregate';

const stats: StatLine = { csPerMin: 6, deaths: 4, visionPerMin: 1, damagePerMin: 500, goldPerMin: 400 };
function game(o: Partial<PlayedGame> & { opp?: number } = {}): PlayedGame {
  const { opp, ...rest } = o;
  return {
    championKey: 1, lane: 'top', win: true, kills: 0, deaths: 0, assists: 0, items: [], you: stats,
    opponent: opp === undefined ? null : { championKey: opp, stats }, ...rest,
  };
}
const repeat = (n: number, o: Partial<PlayedGame> & { opp?: number } = {}) => Array.from({ length: n }, () => game(o));
const texts = (games: PlayedGame[], laneData = new Map<string, LaneData>()) =>
  buildAdvice({ games, pool: buildPool(games), mainLane: mainLane(games), laneData, championName: (k) => `C${k}`, itemName: (id) => `I${id}` })
    .map((a) => `${a.kind}: ${a.text}`);

describe('buildAdvice', () => {
  it('names the best pick with 5+ games', () => {
    expect(texts([...repeat(5), game({ win: false })])).toContain('best: Best pick: C1 — 83% over 6 games');
  });

  it('needs 5 games for a pick line', () => {
    expect(texts(repeat(4)).filter((t) => t.startsWith('best'))).toEqual([]);
  });

  it('flags a struggling champion and does not call it best', () => {
    const t = texts([...repeat(2, { championKey: 3 }), ...repeat(3, { championKey: 3, win: false })]);
    expect(t).toContain('struggling: Struggling: C3 — 40% over 5 games');
    expect(t.filter((x) => x.startsWith('best'))).toEqual([]);
  });

  it('reports off-role games at 20%+', () => {
    const games = [...repeat(8), game({ lane: 'jungle' }), game({ lane: 'jungle', win: false })];
    expect(texts(games)).toContain('offrole: 2 of 10 games off your main lane (top) — 50% win rate there');
    expect(texts([...repeat(9), game({ lane: 'jungle' })]).filter((t) => t.startsWith('offrole'))).toEqual([]);
  });

  it('lists lane opponents that beat you, tagging known counters', () => {
    const games = [...repeat(3, { opp: 7, win: false }), game({ opp: 8, win: false }), game({ opp: 9 }), game({ opp: 9, win: false })];
    expect(texts(games)).toContain('counter: C7 beats you: 0/3 won');
    expect(texts(games, new Map([['1:top', { counterKeys: [7], coreItems: [] }]]))).toContain('counter: C7 beats you: 0/3 won (known counter)');
    expect(texts(games).some((t) => t.includes('C8') || t.includes('C9'))).toBe(false);
  });

  it('flags core items in fewer than half your games', () => {
    const games = [game({ items: [3071, 6333] }), game({ items: [6333] }), game()];
    const laneData = new Map([['1:top', { counterKeys: [], coreItems: [3071, 6333] }]]);
    expect(texts(games, laneData)).toContain('build: C1 top: you rarely finish I3071 (common core)');
    expect(texts(games.slice(0, 2), laneData).filter((t) => t.startsWith('build'))).toEqual([]);
  });

  it('keeps at most 6 lines', () => {
    const games = [1, 2, 3, 4, 5, 6, 7].flatMap((k) => repeat(5, { championKey: k, win: false }));
    expect(texts(games)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- advice`
Expected: FAIL, cannot resolve `../src/profile/advice`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/profile/advice.ts
import type { Advice, Lane } from '@lol/shared';
import { MIN_BENCHMARK_GAMES, type PlayedGame, type PoolRow } from './aggregate';

const MIN_PICK_GAMES = 5;
const MIN_COUNTER_GAMES = 2;
const LOW_WIN_RATE = 40;
const OFF_ROLE_SHARE = 0.2;
const MAX_ADVICE = 6;

export interface LaneData { counterKeys: number[]; coreItems: number[] }
export interface AdviceInput {
  games: PlayedGame[];
  pool: PoolRow[];
  mainLane: Lane | null;
  // lolalytics data by laneKey; missing when unavailable
  laneData: Map<string, LaneData>;
  championName(key: number): string;
  itemName(id: number): string;
}

export const laneKey = (championKey: number, lane: Lane) => `${championKey}:${lane}`;
const pct = (wins: number, games: number) => Math.round((wins / games) * 100);

export function buildAdvice(input: AdviceInput): Advice[] {
  return [...picks(input), ...offRole(input), ...counters(input), ...buildGaps(input)].slice(0, MAX_ADVICE);
}

function picks({ games, championName }: AdviceInput): Advice[] {
  const stats = new Map<number, { games: number; wins: number }>();
  for (const g of games) {
    const s = stats.get(g.championKey) ?? { games: 0, wins: 0 };
    s.games++;
    if (g.win) s.wins++;
    stats.set(g.championKey, s);
  }
  const pool = [...stats]
    .map(([key, s]) => ({ key, games: s.games, winRate: pct(s.wins, s.games) }))
    .filter((c) => c.games >= MIN_PICK_GAMES);
  const advice: Advice[] = [];
  const best = [...pool].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0];
  if (best && best.winRate > LOW_WIN_RATE) {
    advice.push({ kind: 'best', text: `Best pick: ${championName(best.key)} — ${best.winRate}% over ${best.games} games` });
  }
  for (const c of pool.filter((c) => c.winRate <= LOW_WIN_RATE).sort((a, b) => a.winRate - b.winRate)) {
    advice.push({ kind: 'struggling', text: `Struggling: ${championName(c.key)} — ${c.winRate}% over ${c.games} games` });
  }
  return advice;
}

function offRole({ games, mainLane }: AdviceInput): Advice[] {
  if (!mainLane) return [];
  const laned = games.filter((g) => g.lane);
  const off = laned.filter((g) => g.lane !== mainLane);
  if (off.length === 0 || off.length / laned.length < OFF_ROLE_SHARE) return [];
  const wins = off.filter((g) => g.win).length;
  return [{ kind: 'offrole', text: `${off.length} of ${laned.length} games off your main lane (${mainLane}) — ${pct(wins, off.length)}% win rate there` }];
}

function counters({ games, laneData, championName }: AdviceInput): Advice[] {
  const faced = new Map<number, PlayedGame[]>();
  for (const g of games) if (g.opponent) faced.set(g.opponent.championKey, [...(faced.get(g.opponent.championKey) ?? []), g]);
  return [...faced]
    .map(([key, list]) => ({ key, list, wins: list.filter((g) => g.win).length }))
    .filter(({ list, wins }) => list.length >= MIN_COUNTER_GAMES && pct(wins, list.length) <= LOW_WIN_RATE)
    .sort((a, b) => (b.list.length - b.wins) - (a.list.length - a.wins))
    .map(({ key, list, wins }): Advice => {
      const known = list.some((g) => g.lane && laneData.get(laneKey(g.championKey, g.lane))?.counterKeys.includes(key));
      return { kind: 'counter', text: `${championName(key)} beats you: ${wins}/${list.length} won${known ? ' (known counter)' : ''}` };
    });
}

function buildGaps({ games, pool, laneData, championName, itemName }: AdviceInput): Advice[] {
  return pool
    .filter((row) => row.games >= MIN_BENCHMARK_GAMES)
    .flatMap((row): Advice[] => {
      const core = laneData.get(laneKey(row.championKey, row.lane))?.coreItems ?? [];
      const played = games.filter((g) => g.championKey === row.championKey && g.lane === row.lane);
      const missing = core.filter((id) => played.filter((g) => g.items.includes(id)).length < played.length / 2);
      if (missing.length === 0) return [];
      return [{ kind: 'build', text: `${championName(row.championKey)} ${row.lane}: you rarely finish ${missing.map(itemName).join(', ')} (common core)` }];
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w server -- advice`
Expected: 7 tests PASS.

---

### Task 6: Profile service

**Files:**
- Create: `server/src/profile/service.ts`
- Test: `server/test/profileService.test.ts`

**Interfaces:**
- Consumes: `RiotClient`, `RiotError` (Task 2); `RiotMatch` (Task 2); `toGames`, `buildPool`, `mainLane`, `tierForRank`, `PoolRow` (Task 4); `buildAdvice`, `laneKey`, `LaneData` (Task 5); existing `TtlCache` and `MatchupService.getMatchup(champion, lane, tier): Promise<MatchupResponse>`.
- Produces: `ProfileService(riot, matches, catalog, matchups, cache)` with `getProfile(gameName: string, tagLine: string): Promise<ProfileResponse>`; `ProfileCatalog { championByKey(key: number): Champion | undefined; item(id: string): { name: string } | undefined }`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/profileService.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Champion, MatchupResponse } from '@lol/shared';
import { TtlCache } from '../src/cache';
import { RiotError } from '../src/riot/client';
import type { RiotMatch } from '../src/riot/types';
import { ProfileService, type ProfileCatalog } from '../src/profile/service';
import { laneGame } from './fixtures/riot';

const champ = (key: number): Champion => ({ id: `C${key}`, key, name: `C${key}`, icon: `${key}.png` });
const catalog: ProfileCatalog = {
  championByKey: (k) => (k === 999 ? undefined : champ(k)),
  item: (id) => ({ name: `I${id}` }),
};

// 3 losses vs C2, 2 wins vs C3, all C1 top
const matches: Record<string, RiotMatch> = {
  EUW1_1: laneGame('EUW1_1', { champ: 1, opp: 2, win: false }),
  EUW1_2: laneGame('EUW1_2', { champ: 1, opp: 2, win: false }),
  EUW1_3: laneGame('EUW1_3', { champ: 1, opp: 2, win: false }),
  EUW1_4: laneGame('EUW1_4', { champ: 1, opp: 3, win: true }),
  EUW1_5: laneGame('EUW1_5', { champ: 1, opp: 3, win: true }),
};

function setup(o: { ids?: string[]; league?: unknown[]; get?: (id: string) => Promise<RiotMatch>; getMatchup?: () => Promise<MatchupResponse> } = {}) {
  const riot = {
    account: vi.fn(async () => ({ puuid: 'me', gameName: 'Me', tagLine: 'EUW' })),
    matchIds: vi.fn(async () => o.ids ?? Object.keys(matches)),
    leagueEntries: vi.fn(async () => (o.league ?? [{ queueType: 'RANKED_SOLO_5x5', tier: 'PLATINUM', rank: 'II', leaguePoints: 40 }]) as never),
  };
  const store = { get: vi.fn(o.get ?? (async (id: string) => matches[id])) };
  const matchups = {
    getMatchup: vi.fn(o.getMatchup ?? (async () => ({
      champion: champ(1), lane: 'top', tier: 'platinum_plus', counters: [{ champion: champ(2), winRate: 45, games: 2000 }],
      build: { early: [], core: [{ id: '3071', name: 'I3071', icon: '' }], boots: null, games: 1, winRate: 50 },
    }) as MatchupResponse)),
  };
  const service = new ProfileService(riot, store, catalog, matchups, new TtlCache(60_000));
  return { service, riot, store, matchups };
}

describe('ProfileService', () => {
  it('builds the profile', async () => {
    const { service, matchups } = setup();
    const p = await service.getProfile('Me', 'EUW');
    expect(p).toMatchObject({
      riotId: 'Me#EUW', rank: { tier: 'PLATINUM', division: 'II', lp: 40 }, tier: 'platinum_plus',
      games: 5, winRate: 40, mainLane: 'top', lolalyticsAvailable: true,
    });
    expect(p.pool.map((e) => [e.champion.id, e.lane, e.games, e.winRate])).toEqual([['C1', 'top', 5, 40]]);
    expect(matchups.getMatchup).toHaveBeenCalledWith(champ(1), 'top', 'platinum_plus');
    expect(p.advice).toContainEqual({ kind: 'counter', text: 'C2 beats you: 0/3 won (known counter)' });
    expect(p.advice).toContainEqual({ kind: 'build', text: 'C1 top: you rarely finish I3071 (common core)' });
  });

  it('handles a player with no ranked games', async () => {
    const p = await setup({ ids: [], league: [] }).service.getProfile('Me', 'EUW');
    expect(p).toMatchObject({ games: 0, winRate: 0, mainLane: null, pool: [], advice: [], rank: null, tier: 'gold_plus' });
  });

  it('still loads when lolalytics fails', async () => {
    const p = await setup({ getMatchup: async () => { throw new Error('down'); } }).service.getProfile('Me', 'EUW');
    expect(p.lolalyticsAvailable).toBe(false);
    expect(p.pool).toHaveLength(1);
    expect(p.advice).toContainEqual({ kind: 'counter', text: 'C2 beats you: 0/3 won' });
  });

  it('skips a match that returns 404', async () => {
    const get = async (id: string) => { if (id === 'EUW1_2') throw new RiotError('not_found', 'Not found'); return matches[id]; };
    expect((await setup({ get }).service.getProfile('Me', 'EUW')).games).toBe(4);
  });

  it('fails on other match errors', async () => {
    const get = async () => { throw new RiotError('busy', 'Riot API busy, try again in a minute'); };
    await expect(setup({ get }).service.getProfile('Me', 'EUW')).rejects.toThrow('busy');
  });

  it('drops champions unknown to Data Dragon', async () => {
    const odd = { EUW1_9: laneGame('EUW1_9', { champ: 999, opp: 2 }) };
    const p = await setup({ ids: ['EUW1_9'], get: async (id) => odd[id as 'EUW1_9'] }).service.getProfile('Me', 'EUW');
    expect(p.games).toBe(1);
    expect(p.pool).toEqual([]);
  });

  it('fetches at most 5 matches at once', async () => {
    let active = 0, peak = 0;
    const ids = Array.from({ length: 12 }, (_, i) => `EUW1_${i + 100}`);
    const get = async (id: string) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return laneGame(id, { champ: 1, opp: 2 });
    };
    await setup({ ids, get }).service.getProfile('Me', 'EUW');
    expect(peak).toBe(5);
  });

  it('caches by Riot ID, ignoring case', async () => {
    const { service, riot } = setup();
    await service.getProfile('me', 'euw');
    expect((await service.getProfile('Me', 'EUW')).riotId).toBe('Me#EUW');
    expect(riot.account).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- profileService`
Expected: FAIL, cannot resolve `../src/profile/service`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/profile/service.ts
import type { Champion, PoolEntry, ProfileResponse, Rank, Tier } from '@lol/shared';
import type { TtlCache } from '../cache';
import type { MatchupService } from '../matchup';
import { RiotError, type RiotClient } from '../riot/client';
import type { RiotMatch } from '../riot/types';
import { buildAdvice, laneKey, type LaneData } from './advice';
import { buildPool, mainLane, tierForRank, toGames, type PoolRow } from './aggregate';

const MATCH_COUNT = 50;
const PARALLEL_FETCHES = 5;
const LOOKUP_MIN_GAMES = 2;

export interface ProfileCatalog {
  championByKey(key: number): Champion | undefined;
  item(id: string): { name: string } | undefined;
}

export class ProfileService {
  constructor(
    private riot: Pick<RiotClient, 'account' | 'matchIds' | 'leagueEntries'>,
    private matches: { get(id: string): Promise<RiotMatch> },
    private catalog: ProfileCatalog,
    private matchups: Pick<MatchupService, 'getMatchup'>,
    private cache: TtlCache,
  ) {}

  getProfile(gameName: string, tagLine: string): Promise<ProfileResponse> {
    return this.cache.getOrLoad(`profile:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`, () => this.load(gameName, tagLine));
  }

  private async load(gameName: string, tagLine: string): Promise<ProfileResponse> {
    const account = await this.riot.account(gameName, tagLine);
    const [ids, entries] = await Promise.all([this.riot.matchIds(account.puuid, MATCH_COUNT), this.riot.leagueEntries(account.puuid)]);
    const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
    const rank: Rank | null = solo ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : null;
    const tier = tierForRank(solo?.tier);

    const fetched = await mapLimit(ids, PARALLEL_FETCHES, (id) => this.fetchMatch(id));
    const games = toGames(account.puuid, fetched.filter((m): m is RiotMatch => m !== null));
    const rows = buildPool(games);
    const { laneData, available } = await this.lookupLanes(rows, tier);
    const lane = mainLane(games);

    return {
      riotId: `${account.gameName}#${account.tagLine}`,
      rank, tier,
      games: games.length,
      winRate: games.length ? Math.round((games.filter((g) => g.win).length / games.length) * 100) : 0,
      mainLane: lane,
      pool: rows.flatMap((r) => this.entry(r)),
      advice: buildAdvice({
        games, pool: rows, mainLane: lane, laneData,
        championName: (key) => this.catalog.championByKey(key)?.name ?? `#${key}`,
        itemName: (id) => this.catalog.item(String(id))?.name ?? `#${id}`,
      }),
      lolalyticsAvailable: available,
    };
  }

  // a deleted match must not read as "account not found"
  private fetchMatch(id: string): Promise<RiotMatch | null> {
    return this.matches.get(id).catch((e) => {
      if (e instanceof RiotError && e.kind === 'not_found') return null;
      throw e;
    });
  }

  private entry(r: PoolRow): PoolEntry[] {
    const champion = this.catalog.championByKey(r.championKey);
    if (!champion) return [];
    return [{ champion, lane: r.lane, games: r.games, wins: r.wins, winRate: Math.round((r.wins / r.games) * 100), kda: r.kda, you: r.you, opponents: r.opponents }];
  }

  // lolalytics counters and core build per played champion and lane
  private async lookupLanes(rows: PoolRow[], tier: Tier): Promise<{ laneData: Map<string, LaneData>; available: boolean }> {
    const laneData = new Map<string, LaneData>();
    let available = true;
    await Promise.all(rows.filter((r) => r.games >= LOOKUP_MIN_GAMES).map(async (r) => {
      const champion = this.catalog.championByKey(r.championKey);
      if (!champion) return;
      try {
        const m = await this.matchups.getMatchup(champion, r.lane, tier);
        laneData.set(laneKey(r.championKey, r.lane), {
          counterKeys: m.counters.map((c) => c.champion.key),
          coreItems: m.build?.core.map((i) => Number(i.id)) ?? [],
        });
      } catch {
        available = false;
      }
    }));
    return { laneData, available };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w server -- profileService`
Expected: 8 tests PASS.

---

### Task 7: API route and server wiring

**Files:**
- Modify: `server/src/app.ts`, `server/src/server.ts`
- Test: `server/test/app.test.ts`

**Interfaces:**
- Consumes: `ProfileService.getProfile` (Task 6), `RiotError` (Task 2), `RiotClient`, `MatchStore` (Tasks 2–3).
- Produces: `GET /api/profile/:gameName/:tagLine` → `ProfileResponse`; `AppDeps.profiles: Pick<ProfileService, 'getProfile'>`.

- [ ] **Step 1: Write the failing tests**

In `server/test/app.test.ts`:
- Add imports:

```ts
import type { ProfileResponse } from '@lol/shared';
import { RiotError } from '../src/riot/client';
```

- Add a stub above `function deps`:

```ts
const profile: ProfileResponse = {
  riotId: 'Mr Noodle#EUW', rank: null, tier: 'gold_plus', games: 0, winRate: 0, mainLane: null, pool: [], advice: [], lolalyticsAvailable: true,
};
```

- In `deps()`, add this property after `matchups: {...},`:

```ts
    profiles: { getProfile: vi.fn().mockResolvedValue(profile) },
```

- Add the tests inside `describe('API', ...)`:

```ts
  it('returns a profile, decoding the Riot ID', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/profile/Mr%20Noodle/EUW');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(profile);
    expect(d.profiles.getProfile).toHaveBeenCalledWith('Mr Noodle', 'EUW');
  });

  it('404 when the Riot ID does not exist', async () => {
    const d = deps();
    vi.mocked(d.profiles.getProfile).mockRejectedValue(new RiotError('not_found', 'Not found'));
    const res = await request(createApp(d)).get('/api/profile/Nobody/EUW');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No EUW account for Nobody#EUW' });
  });

  it('503 with the Riot message on key or busy errors', async () => {
    const d = deps();
    vi.mocked(d.profiles.getProfile).mockRejectedValue(new RiotError('key', 'Riot API key missing or expired'));
    const res = await request(createApp(d)).get('/api/profile/Me/EUW');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Riot API key missing or expired' });
  });

  it('502 on other Riot errors', async () => {
    const d = deps();
    vi.mocked(d.profiles.getProfile).mockRejectedValue(new RiotError('http', 'Riot API HTTP 500'));
    const res = await request(createApp(d)).get('/api/profile/Me/EUW');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Data source unavailable' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- app`
Expected: the 4 new tests FAIL with 404 responses (route missing). The typecheck step later confirms `profiles` is part of `AppDeps`.

- [ ] **Step 3: Implement the route**

In `server/src/app.ts`:
- Add imports:

```ts
import type { ProfileService } from './profile/service';
import { RiotError } from './riot/client';
```

- Extend `AppDeps`:

```ts
export interface AppDeps {
  champions: { champions(): Champion[]; championById(id: string): Champion | undefined };
  matchups: Pick<MatchupService, 'getMatchup' | 'getTierList' | 'getMainLanes'>;
  profiles: Pick<ProfileService, 'getProfile'>;
}
```

- Add `class NotFound extends Error {}` under `class BadRequest extends Error {}`.
- Change the signature to `export function createApp({ champions, matchups, profiles }: AppDeps) {`.
- Add the route after `/api/tierlist`:

```ts
  app.get('/api/profile/:gameName/:tagLine', async (req, res) => {
    const { gameName, tagLine } = req.params;
    try {
      res.json(await profiles.getProfile(gameName, tagLine));
    } catch (e) {
      if (e instanceof RiotError && e.kind === 'not_found') throw new NotFound(`No EUW account for ${gameName}#${tagLine}`);
      throw e;
    }
  });
```

- Replace the error handler body:

```ts
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return void res.status(400).json({ error: err.message });
    if (err instanceof NotFound) return void res.status(404).json({ error: err.message });
    console.error(err);
    if (err instanceof RiotError && err.kind !== 'http') return void res.status(503).json({ error: err.message });
    if (err instanceof ProviderError || err instanceof RiotError) return void res.status(502).json({ error: 'Data source unavailable' });
    res.status(500).json({ error: 'Internal error' });
  });
```

- [ ] **Step 4: Wire the server**

In `server/src/server.ts`:
- Add imports:

```ts
import { fileURLToPath } from 'node:url';
import { ProfileService } from './profile/service';
import { RiotClient } from './riot/client';
import { MatchStore } from './riot/matchStore';
```

- Replace the `createApp(...)` block with:

```ts
if (!config.riotApiKey) console.warn('RIOT_API_KEY is empty: player profiles are disabled');
const riot = new RiotClient(config.riotApiKey);
const store = new MatchStore(fileURLToPath(new URL('../data/matches', import.meta.url)), (id) => riot.match(id));
const profiles = new ProfileService(riot, store, dd, matchups, new TtlCache(5 * 60 * 1000));

createApp({ champions: dd, matchups, profiles }).listen(config.port, config.host, () => {
  console.log(`API on http://${config.host}:${config.port} (provider: ${config.provider})`);
});
```

- [ ] **Step 5: Run server tests and typecheck**

Run: `npm test -w server && npm run typecheck -w server`
Expected: all server tests PASS; typecheck exits 0.

---

### Task 8: Player page component

**Files:**
- Create: `web/src/riotId.ts`, `web/src/components/PlayerPage.tsx`
- Modify: `web/src/api.ts`, `web/src/style.css`
- Test: `web/src/riotId.test.ts`, `web/src/components/PlayerPage.test.tsx`

**Interfaces:**
- Consumes: `ProfileResponse`, `PoolEntry`, `StatLine`, `Lane` (shared, Task 4).
- Produces: `parseRiotId(text): { gameName: string; tagLine: string } | null`; `fetchProfile(gameName, tagLine): Promise<ProfileResponse>`; `<PlayerPage data={ProfileResponse} onOpen={(id: string, lane: Lane) => void} />`; `compare(you, them, lowerIsBetter?): 'better' | 'worse' | 'even'`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/riotId.test.ts
import { parseRiotId } from './riotId';

describe('parseRiotId', () => {
  it('splits name and tag', () => {
    expect(parseRiotId(' Mr Noodle#EUW ')).toEqual({ gameName: 'Mr Noodle', tagLine: 'EUW' });
  });
  it('rejects text without a name or tag', () => {
    expect(parseRiotId('Darius')).toBeNull();
    expect(parseRiotId('Name#')).toBeNull();
    expect(parseRiotId('#EUW')).toBeNull();
  });
});
```

```tsx
// web/src/components/PlayerPage.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import type { ProfileResponse, StatLine } from '@lol/shared';
import { PlayerPage, compare } from './PlayerPage';

const champ = (id: string) => ({ id, key: id.length, name: id, icon: `${id}.png` });
const you: StatLine = { csPerMin: 7, deaths: 6, visionPerMin: 1, damagePerMin: 500, goldPerMin: 400 };
const opp: StatLine = { csPerMin: 6, deaths: 4, visionPerMin: 1, damagePerMin: 500, goldPerMin: 400 };
const profile: ProfileResponse = {
  riotId: 'Me#EUW', rank: { tier: 'GOLD', division: 'I', lp: 12 }, tier: 'gold_plus',
  games: 10, winRate: 60, mainLane: 'top', lolalyticsAvailable: true,
  pool: [
    { champion: champ('Darius'), lane: 'top', games: 8, wins: 5, winRate: 63, kda: 2.5, you, opponents: opp },
    { champion: champ('Garen'), lane: 'top', games: 2, wins: 1, winRate: 50, kda: 1, you: null, opponents: null },
  ],
  advice: [{ kind: 'best', text: 'Best pick: Darius — 63% over 8 games' }],
};

describe('compare', () => {
  it('uses a 10% threshold', () => {
    expect(compare(7, 6)).toBe('better');
    expect(compare(6.5, 6)).toBe('even');
    expect(compare(5, 6)).toBe('worse');
  });
  it('treats fewer deaths as better', () => {
    expect(compare(3, 4, true)).toBe('better');
    expect(compare(6, 4, true)).toBe('worse');
  });
  it('is even against zero', () => {
    expect(compare(2, 0)).toBe('even');
  });
});

describe('PlayerPage', () => {
  it('shows the header and advice', () => {
    render(<PlayerPage data={profile} onOpen={() => {}} />);
    expect(screen.getByText('Me#EUW')).toBeInTheDocument();
    expect(screen.getByText('GOLD I · 12 LP · 10 ranked games analysed · 60% WR · main top')).toBeInTheDocument();
    expect(screen.getByText('Best pick: Darius — 63% over 8 games')).toBeInTheDocument();
  });

  it('colours benchmarks and greys out rows with few games', () => {
    render(<PlayerPage data={profile} onOpen={() => {}} />);
    expect(screen.getByText('7.0 / 6.0')).toHaveClass('better');
    expect(screen.getByText('6.0 / 4.0')).toHaveClass('worse');
    expect(screen.getByText('too few games').closest('tr')).toHaveClass('few');
  });

  it('opens a champion page', () => {
    const onOpen = vi.fn();
    render(<PlayerPage data={profile} onOpen={onOpen} />);
    fireEvent.click(screen.getByLabelText('Open Darius page'));
    expect(onOpen).toHaveBeenCalledWith('Darius', 'top');
  });

  it('says when there are no ranked games', () => {
    render(<PlayerPage data={{ ...profile, rank: null, games: 0, pool: [], advice: [] }} onOpen={() => {}} />);
    expect(screen.getByText('No ranked Solo/Duo games found')).toBeInTheDocument();
    expect(screen.getByText('Unranked · 0 ranked games analysed · main top')).toBeInTheDocument();
  });

  it('notes when lolalytics is unavailable', () => {
    render(<PlayerPage data={{ ...profile, lolalyticsAvailable: false }} onOpen={() => {}} />);
    expect(screen.getByText('lolalytics unavailable: counter tags and build advice skipped')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- riotId PlayerPage`
Expected: FAIL, cannot resolve `./riotId` and `./PlayerPage`.

- [ ] **Step 3: Write `riotId.ts` and `fetchProfile`**

```ts
// web/src/riotId.ts
export interface RiotId { gameName: string; tagLine: string }

// split at the last # (tags never contain one)
export function parseRiotId(text: string): RiotId | null {
  const i = text.lastIndexOf('#');
  if (i < 0) return null;
  const gameName = text.slice(0, i).trim();
  const tagLine = text.slice(i + 1).trim();
  return gameName && tagLine ? { gameName, tagLine } : null;
}
```

In `web/src/api.ts`, add `ProfileResponse` to the type import and append:

```ts
export const fetchProfile = (gameName: string, tagLine: string) =>
  get<ProfileResponse>(`/api/profile/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
```

- [ ] **Step 4: Write `PlayerPage.tsx`**

```tsx
// web/src/components/PlayerPage.tsx
import type { Lane, PoolEntry, ProfileResponse, StatLine } from '@lol/shared';

interface Props { data: ProfileResponse; onOpen(id: string, lane: Lane): void }

const METRICS: { key: keyof StatLine; label: string; digits: number; lowerIsBetter?: boolean }[] = [
  { key: 'csPerMin', label: 'CS/min', digits: 1 },
  { key: 'deaths', label: 'Deaths', digits: 1, lowerIsBetter: true },
  { key: 'visionPerMin', label: 'Vision/min', digits: 2 },
  { key: 'damagePerMin', label: 'Dmg/min', digits: 0 },
  { key: 'goldPerMin', label: 'Gold/min', digits: 0 },
];
const THRESHOLD = 0.1;

// better/worse only beyond 10% from your opponents
export function compare(you: number, them: number, lowerIsBetter = false): 'better' | 'worse' | 'even' {
  if (them === 0) return 'even';
  const diff = (you - them) / them;
  if (Math.abs(diff) <= THRESHOLD) return 'even';
  return diff > 0 !== lowerIsBetter ? 'better' : 'worse';
}

export function PlayerPage({ data, onOpen }: Props) {
  const summary = [
    data.rank ? `${data.rank.tier} ${data.rank.division} · ${data.rank.lp} LP` : 'Unranked',
    `${data.games} ranked games analysed`,
    data.games > 0 ? `${data.winRate}% WR` : null,
    data.mainLane ? `main ${data.mainLane}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="player">
      <h2>{data.riotId}</h2>
      <p className="muted">{summary}</p>
      {data.games === 0 ? (
        <p className="muted">No ranked Solo/Duo games found</p>
      ) : (
        <>
          {!data.lolalyticsAvailable && <p className="muted">lolalytics unavailable: counter tags and build advice skipped</p>}
          {data.advice.length > 0 && (
            <section>
              <h3>Advice</h3>
              <ul className="advice">{data.advice.map((a) => <li key={a.text} className={`advice-${a.kind}`}>{a.text}</li>)}</ul>
            </section>
          )}
          <section>
            <h3>Champion pool</h3>
            <PoolTable pool={data.pool} onOpen={onOpen} />
          </section>
        </>
      )}
    </div>
  );
}

function PoolTable({ pool, onOpen }: { pool: PoolEntry[]; onOpen: Props['onOpen'] }) {
  return (
    <table className="pool">
      <thead>
        <tr>
          <th>Champion</th><th>Lane</th><th>Games</th><th>W-L</th><th>WR</th><th>KDA</th>
          {METRICS.map((m) => <th key={m.key}>{m.label}<br /><small>you / opp</small></th>)}
        </tr>
      </thead>
      <tbody>
        {pool.map(({ champion, lane, games, wins, winRate, kda, you, opponents }) => (
          <tr key={`${champion.id}:${lane}`} className={you ? undefined : 'few'}>
            <td>
              <img src={champion.icon} alt="" width={24} height={24} /> {champion.name}{' '}
              <button className="open" aria-label={`Open ${champion.name} page`} onClick={() => onOpen(champion.id, lane)}>↗</button>
            </td>
            <td>{lane}</td><td>{games}</td><td>{wins}-{games - wins}</td><td>{winRate}%</td><td>{kda.toFixed(2)}</td>
            {you && opponents
              ? METRICS.map((m) => (
                <td key={m.key} className={compare(you[m.key], opponents[m.key], m.lowerIsBetter)}>
                  {you[m.key].toFixed(m.digits)} / {opponents[m.key].toFixed(m.digits)}
                </td>
              ))
              : <td colSpan={METRICS.length} className="muted">too few games</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Add styles**

Append to `web/src/style.css`:

```css
.player section { overflow-x: auto; }
.advice li { margin: 4px 0; }
.pool { width: 100%; border-collapse: collapse; font-size: 14px; }
.pool th, .pool td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--muted); white-space: nowrap; }
.pool td img { vertical-align: middle; }
.pool tr.few { opacity: 0.55; }
.pool td.better { color: var(--good); }
.pool td.worse { color: var(--bad); }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w web -- riotId PlayerPage`
Expected: all riotId and PlayerPage tests PASS.

---

### Task 9: App routing, search and changelog

**Files:**
- Modify: `web/src/App.tsx`, `web/src/App.test.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `parseRiotId`, `fetchProfile`, `PlayerPage` (Task 8).
- Produces: URL `?player=Name%23TAG`; a search containing `#` opens the player page.

- [ ] **Step 1: Write the failing tests**

In `web/src/App.test.tsx`:
- Add `ProfileResponse` to the `@lol/shared` type import.
- Add a stub under `matchupFor`:

```ts
const profileFor = (riotId: string): ProfileResponse => ({
  riotId, rank: null, tier: 'gold_plus', games: 0, winRate: 0, mainLane: null, pool: [], advice: [], lolalyticsAvailable: true,
});
```

- In `beforeEach`, add `vi.clearAllMocks();` as the first line so the new `not.toHaveBeenCalled` checks aren't polluted by earlier tests (it clears calls, not implementations). Then add:

```ts
  vi.mocked(api.fetchProfile).mockImplementation(async (name, tag) => profileFor(`${name}#${tag}`));
```

- Add the tests inside `describe('App', ...)`:

```ts
  it('opens a player page from a Riot ID', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'Mr Noodle#EUW' } });
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(window.location.search).toBe('?player=Mr+Noodle%23EUW');
    expect(api.fetchProfile).toHaveBeenCalledWith('Mr Noodle', 'EUW');
    expect(screen.getByRole('heading', { name: 'Mr Noodle#EUW' })).toBeInTheDocument();
  });

  it('loads a player page from the URL', async () => {
    window.history.replaceState(null, '', '/?player=Me%23EUW');
    render(<App />);
    await flush();
    expect(api.fetchProfile).toHaveBeenCalledWith('Me', 'EUW');
    expect(screen.getByLabelText('Champion')).toHaveValue('Me#EUW');
    expect(api.fetchTierList).not.toHaveBeenCalled();
  });

  it('rejects an incomplete Riot ID', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'Name#' } });
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(screen.getByText('Invalid Riot ID: Name#')).toBeInTheDocument();
    expect(api.fetchProfile).not.toHaveBeenCalled();
  });

  it('shows the API error for an unknown Riot ID', async () => {
    vi.mocked(api.fetchProfile).mockRejectedValue(new Error('No EUW account for Nobody#EUW'));
    window.history.replaceState(null, '', '/?player=Nobody%23EUW');
    render(<App />);
    await flush();
    expect(screen.getByText('No EUW account for Nobody#EUW')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- App`
Expected: the 4 new tests FAIL (no player routing yet).

- [ ] **Step 3: Implement routing and search in `App.tsx`**

- Imports: add `ProfileResponse` to the `@lol/shared` type import, `fetchProfile` to the `./api` import, and:

```ts
import { PlayerPage } from './components/PlayerPage';
import { parseRiotId } from './riotId';
```

- Route and URL helpers:

```ts
interface Route { champ: string | null; player: string | null; lane: Lane; tier: Tier }

function readRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const lane = q.get('lane') as Lane;
  const tier = q.get('tier') as Tier;
  return {
    champ: q.get('champ'),
    player: q.get('player'),
    lane: LANES.includes(lane) ? lane : 'top',
    tier: TIERS.includes(tier) ? tier : DEFAULT_TIER,
  };
}

function routeUrl({ champ, player, lane, tier }: Route): string {
  if (player) return `?${new URLSearchParams({ player })}`;
  const q = new URLSearchParams();
  if (champ) q.set('champ', champ);
  // homepage on the default lane stays at /
  if (champ || lane !== 'top') q.set('lane', lane);
  if (tier !== DEFAULT_TIER) q.set('tier', tier);
  const query = q.toString();
  return query ? `?${query}` : '/';
}
```

- State: add `const [profile, setProfile] = useState<ProfileResponse | null>(null);` after `tierList`.
- Search-box effect:

```ts
  // search box shows the current player or champion, empty on the homepage
  useEffect(() => {
    if (route.player) return setQuery(route.player);
    setQuery(route.champ ? (champions.find((c) => c.id === route.champ)?.name ?? route.champ) : '');
  }, [route.player, route.champ, champions]);
```

- Load effect: replace the `const load = ...` and `.catch(...)` lines with:

```ts
    const riotId = route.player ? parseRiotId(route.player) : null;
    const load = riotId
      ? fetchProfile(riotId.gameName, riotId.tagLine).then((p) => { if (id === request.current) setProfile(p); })
      : route.champ
        ? fetchMatchup(route.champ, route.lane, route.tier).then((r) => { if (id === request.current) setResult(r); })
        : fetchTierList(route.lane, route.tier).then((t) => { if (id === request.current) setTierList(t); });
    load
      .catch((e) => { if (id === request.current) { setResult(null); setTierList(null); setProfile(null); setError((e as Error).message); } })
      .finally(() => { if (id === request.current) setLoading(false); });
```

- `search()`:

```ts
  function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.includes('#')) {
      const riotId = parseRiotId(query);
      if (!riotId) return setError(`Invalid Riot ID: ${query.trim()}`);
      return navigate({ ...route, champ: null, player: `${riotId.gameName}#${riotId.tagLine}` });
    }
    const champion = findChampion(champions, query);
    if (!champion) return setError(`Unknown champion: ${query.trim()}`);
    open(champion.id, draftLane);
  }
```

- `changeLane()`: change the condition to `if (!route.champ && !route.player) navigate({ ...route, lane });`.
- `open` and `home`:

```ts
  const open = (champ: string, lane: Lane) => navigate({ champ, player: null, lane, tier: route.tier });
  const home: Route = { champ: null, player: null, lane: HOME_LANE, tier: route.tier };
```

- In the JSX, change the field label to `<span className="field-label">Champion or Riot ID</span>`. Change the tier list line to `{!route.champ && !route.player && tierList && <TierList ... />}` and keep its props. Add after it:

```tsx
      {route.player && profile && <PlayerPage data={profile} onOpen={open} />}
```

- In `web/src/components/ChampionPicker.tsx`, change the placeholder to `placeholder="Champion or Name#TAG…"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- App`
Expected: all App tests PASS, including the existing ones.

- [ ] **Step 5: Update the changelog**

`0.1.0` is untagged, so add this under `## [0.1.0] - 2026-09-24` → `### Added` in `CHANGELOG.md`:

```
- feat: player profile from a Riot ID (champion pool, stats vs lane opponents, advice)
```

- [ ] **Step 6: Full verification**

Run: `npm test && npm run typecheck`
Expected: all server and web tests PASS (70 existing plus the new ones); both typechecks exit 0.

- [ ] **Step 7: Manual check with the real key**

Set `RIOT_API_KEY` in `.env`, run `npm run dev`, search your `Name#TAG` and check:
- The first load takes a few seconds, and a reload is instant.
- `server/data/matches/` fills with JSON files.
- An unknown Riot ID shows "No EUW account for …".
