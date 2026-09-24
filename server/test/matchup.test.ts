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

describe('MatchupService.getTierList', () => {
  it('returns best and worst win rates above minGames, skipping off-role and unknown champions', async () => {
    const res = await service(provider()).getTierList('top');
    expect(res.lane).toBe('top');
    expect(res.best.map((e) => e.champion.key)).toEqual([4, 1, 5, 6, 3]);
    expect(res.worst.map((e) => e.champion.key)).toEqual([3, 6, 5, 1, 4]);
    expect(res.best[0]).toEqual({ champion: champ(4), winRate: 55, games: 9000 });
  });

  it('caches per lane', async () => {
    const p = provider();
    const s = service(p);
    await s.getTierList('top');
    await s.getTierList('top');
    await s.getTierList('jungle');
    expect(p.getTierList).toHaveBeenCalledTimes(2);
  });
});
