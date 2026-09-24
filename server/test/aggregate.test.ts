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
