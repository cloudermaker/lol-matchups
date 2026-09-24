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

// 12 known counters (win rate 40..51) plus noise
const counters = [
  ...Array.from({ length: 12 }, (_, i) => ({ championKey: i + 1, winRate: 40 + i, games: 1000 + i })),
  { championKey: 50, winRate: 30, games: 999 },   // below minGames
  { championKey: 999, winRate: 20, games: 9000 }, // unknown to catalog
];

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    getCounters: vi.fn().mockResolvedValue(counters),
    getBuild: vi.fn().mockResolvedValue({
      early: ['1055'], core: ['3142', '3742', '6333'], bootsCandidates: ['3142', '3047'], games: 5062, winRate: 57.65,
    }),
    getTierList: vi.fn().mockResolvedValue([
      { championKey: 1, winRate: 53, games: 5000, laneShare: 80 },
      { championKey: 2, winRate: 60, games: 50, laneShare: 90 },     // below minGames
      { championKey: 3, winRate: 41, games: 1200, laneShare: 10 },   // exactly min lane share: kept
      { championKey: 4, winRate: 55, games: 9000, laneShare: 95 },
      { championKey: 5, winRate: 50, games: 3000, laneShare: 60 },
      { championKey: 6, winRate: 44, games: 2000, laneShare: 30 },
      { championKey: 8, winRate: 38, games: 4000, laneShare: 9.9 },  // off-role
      { championKey: 999, winRate: 70, games: 9000, laneShare: 90 }, // unknown to catalog
    ]),
    getMainLanes: vi.fn().mockResolvedValue({ 1: 'top', 2: 'jungle', 999: 'middle' }),
    ...overrides,
  };
}
const service = (p: Provider) => new MatchupService(p, catalog, new TtlCache(60_000), 1000);

describe('MatchupService.getMatchup', () => {
  it('returns the 10 lowest win rates above minGames, skipping unknown champions', async () => {
    const res = await service(provider()).getMatchup(darius, 'top', 'platinum_plus');
    expect(res.counters.map((c) => c.champion.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(res.counters[0]).toEqual({ champion: champ(1), winRate: 40, games: 1000 });
    expect(res.tier).toBe('platinum_plus');
  });

  it('returns fewer than 10 when not enough data', async () => {
    const p = provider({ getCounters: vi.fn().mockResolvedValue([{ championKey: 1, winRate: 48, games: 5000 }]) });
    expect((await service(p).getMatchup(darius, 'top', 'platinum_plus')).counters).toHaveLength(1);
  });

  it('enriches the build, picks real boots and passes the tier', async () => {
    const p = provider();
    const res = await service(p).getMatchup(darius, 'top', 'emerald_plus');
    expect(res.build).toEqual({
      early: [{ id: '1055', name: 'I1055', icon: '1055.png' }],
      core: ['3142', '3742', '6333'].map((id) => ({ id, name: `I${id}`, icon: `${id}.png` })),
      boots: { id: '3047', name: 'I3047', icon: '3047.png' },
      games: 5062,
      winRate: 57.65,
    });
    expect(p.getCounters).toHaveBeenCalledWith('Darius', 'top', 'emerald_plus');
    expect(p.getBuild).toHaveBeenCalledWith('Darius', 'top', 'emerald_plus');
  });

  it('caches per champion, lane and tier', async () => {
    const p = provider();
    const s = service(p);
    await s.getMatchup(darius, 'top', 'platinum_plus');
    await s.getMatchup(darius, 'top', 'platinum_plus');
    await s.getMatchup(darius, 'jungle', 'platinum_plus');
    await s.getMatchup(darius, 'top', 'emerald_plus');
    expect(p.getCounters).toHaveBeenCalledTimes(3);
  });
});

describe('MatchupService.getTierList', () => {
  it('returns best and worst win rates above minGames, skipping off-role and unknown champions', async () => {
    const res = await service(provider()).getTierList('top', 'platinum_plus');
    expect(res).toMatchObject({ lane: 'top', tier: 'platinum_plus' });
    expect(res.best.map((e) => e.champion.key)).toEqual([4, 1, 5, 6, 3]);
    expect(res.worst.map((e) => e.champion.key)).toEqual([3, 6, 5, 1, 4]);
    expect(res.best[0]).toEqual({ champion: champ(4), winRate: 55, games: 9000 });
  });

  it('caches per lane and tier', async () => {
    const p = provider();
    const s = service(p);
    await s.getTierList('top', 'platinum_plus');
    await s.getTierList('top', 'platinum_plus');
    await s.getTierList('jungle', 'platinum_plus');
    await s.getTierList('top', 'emerald_plus');
    expect(p.getTierList).toHaveBeenCalledTimes(3);
  });
});

describe('MatchupService.getMainLanes', () => {
  it('maps champion ids to their main lane, skipping unknown champions', async () => {
    expect(await service(provider()).getMainLanes()).toEqual({ C1: 'top', C2: 'jungle' });
  });

  it('caches the result', async () => {
    const p = provider();
    const s = service(p);
    await s.getMainLanes();
    await s.getMainLanes();
    expect(p.getMainLanes).toHaveBeenCalledTimes(1);
  });
});
