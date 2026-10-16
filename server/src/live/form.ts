import type { LiveFormResponse } from '@lol/shared';
import { isRemake } from '../profile/aggregate';
import type { RiotMatch } from '../riot/types';

// matches are newest first
export function buildForm(puuid: string, matches: RiotMatch[], championKey: number): LiveFormResponse {
  const played = matches.filter((m) => !isRemake(m)).flatMap((m) => m.info.participants.filter((p) => p.puuid === puuid));
  const sum = (k: 'kills' | 'deaths' | 'assists') => played.reduce((s, p) => s + p[k], 0);
  const champ = played.filter((p) => p.championId === championKey);
  return {
    games: played.length,
    wins: played.filter((p) => p.win).length,
    streak: streak(played.map((p) => p.win)),
    kda: played.length ? Math.round(((sum('kills') + sum('assists')) / Math.max(1, sum('deaths'))) * 100) / 100 : 0,
    champGames: champ.length,
    champWins: champ.filter((p) => p.win).length,
  };
}

function streak(results: boolean[]): string {
  if (!results.length) return '';
  const end = results.findIndex((w) => w !== results[0]);
  return `${results[0] ? 'W' : 'L'}${end < 0 ? results.length : end}`;
}
