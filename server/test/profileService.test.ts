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
    account: vi.fn(async (_name: string, tag: string) => ({ puuid: 'me', gameName: 'Me', tagLine: tag.toUpperCase() })),
    matchIds: vi.fn(async (_puuid: string, _count: number) => o.ids ?? Object.keys(matches)),
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

  it('shares one load between concurrent requests', async () => {
    const { service, riot } = setup();
    const [a, b] = await Promise.all([service.getProfile('Me', 'EUW'), service.getProfile('me', 'euw')]);
    expect(a).toBe(b);
    expect(riot.account).toHaveBeenCalledOnce();
  });

  it('loads again after a failed load', async () => {
    const { service, riot } = setup();
    riot.account.mockRejectedValueOnce(new RiotError('busy', 'Riot API busy, try again in a minute'));
    await expect(service.getProfile('Me', 'EUW')).rejects.toThrow('busy');
    expect((await service.getProfile('Me', 'EUW')).riotId).toBe('Me#EUW');
    expect(riot.account).toHaveBeenCalledTimes(2);
  });

  describe('without a tag', () => {
    const notFound = () => new RiotError('not_found', 'Not found');

    it('tries EUW first', async () => {
      const { service, riot } = setup();
      expect((await service.findProfile('Me')).riotId).toBe('Me#EUW');
      expect(riot.account.mock.calls).toEqual([['Me', 'EUW']]);
    });

    it('falls back to EUR', async () => {
      const { service, riot } = setup();
      riot.account.mockImplementation(async (_name, tag) => {
        if (tag === 'EUW') throw notFound();
        return { puuid: 'me', gameName: 'Me', tagLine: tag };
      });
      expect((await service.findProfile('Me')).riotId).toBe('Me#EUR');
    });

    // tags in withGames get the fixture player "me"; others an empty account
    function accounts(riot: ReturnType<typeof setup>['riot'], withGames: string[], missing: string[] = []) {
      riot.account.mockImplementation(async (_name, tag) => {
        if (missing.includes(tag)) throw notFound();
        return { puuid: withGames.includes(tag) ? 'me' : `empty-${tag}`, gameName: 'Me', tagLine: tag };
      });
      riot.matchIds.mockImplementation(async (puuid) => (puuid === 'me' ? Object.keys(matches) : []));
    }

    it('prefers EUR when the EUW account has no games', async () => {
      const { service, riot } = setup();
      accounts(riot, ['EUR']);
      expect((await service.findProfile('Me')).riotId).toBe('Me#EUR');
    });

    it('keeps the empty EUW account when EUR has no games either', async () => {
      const { service, riot } = setup();
      accounts(riot, []);
      expect((await service.findProfile('Me')).riotId).toBe('Me#EUW');
    });

    it('keeps the empty EUW account when EUR does not exist', async () => {
      const { service, riot } = setup();
      accounts(riot, [], ['EUR']);
      expect((await service.findProfile('Me')).riotId).toBe('Me#EUW');
    });

    it('reports both tags when neither exists', async () => {
      const { service, riot } = setup();
      riot.account.mockRejectedValue(notFound());
      await expect(service.findProfile('Me')).rejects.toMatchObject({ kind: 'not_found', message: 'No EUW account for Me#EUW or Me#EUR' });
    });

    it('stops on other errors', async () => {
      const { service, riot } = setup();
      riot.account.mockRejectedValue(new RiotError('key', 'Riot API key missing or expired'));
      await expect(service.findProfile('Me')).rejects.toMatchObject({ kind: 'key' });
      expect(riot.account).toHaveBeenCalledOnce();
    });
  });

  it('caches by Riot ID, ignoring case', async () => {
    const { service, riot } = setup();
    await service.getProfile('me', 'euw');
    expect((await service.getProfile('Me', 'EUW')).riotId).toBe('Me#EUW');
    expect(riot.account).toHaveBeenCalledOnce();
  });
});
