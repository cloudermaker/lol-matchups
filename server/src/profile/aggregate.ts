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
