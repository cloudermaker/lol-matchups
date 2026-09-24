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
