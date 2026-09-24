import type { BuildResponse, Champion, Lane, MatchupResponse, TierListResponse } from '@lol/shared';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Request failed');
  return body as T;
}

export const fetchChampions = () => get<Champion[]>('/api/champions');
export const fetchTierList = (lane: Lane) => get<TierListResponse>(`/api/tierlist?${new URLSearchParams({ lane })}`);
export const fetchMatchup = (champ: string, lane: Lane) =>
  get<MatchupResponse>(`/api/matchup?${new URLSearchParams({ champ, lane })}`);
export const fetchBuild = (champ: string, lane: Lane, vs: string) =>
  get<BuildResponse>(`/api/build?${new URLSearchParams({ champ, lane, vs })}`);
