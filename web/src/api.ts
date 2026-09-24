import type { Champion, Lane, MainLanesResponse, MatchupResponse, Tier, TierListResponse } from '@lol/shared';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Request failed');
  return body as T;
}

export const fetchChampions = () => get<Champion[]>('/api/champions');
export const fetchMainLanes = () => get<MainLanesResponse>('/api/main-lanes');
export const fetchTierList = (lane: Lane, tier: Tier) =>
  get<TierListResponse>(`/api/tierlist?${new URLSearchParams({ lane, tier })}`);
export const fetchMatchup = (champ: string, lane: Lane, tier: Tier) =>
  get<MatchupResponse>(`/api/matchup?${new URLSearchParams({ champ, lane, tier })}`);
