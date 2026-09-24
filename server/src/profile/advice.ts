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
