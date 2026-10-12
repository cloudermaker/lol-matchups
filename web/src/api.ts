import type { Champion, Lane, LiveFormResponse, LiveGameResponse, MainLanesResponse, MatchupResponse, PatchResponse, ProfileResponse, Tier, TierListResponse, VersusResponse } from '@lol/shared';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Request failed');
  return body as T;
}

export const fetchChampions = () => get<Champion[]>('/api/champions');
export const fetchMainLanes = () => get<MainLanesResponse>('/api/main-lanes');
export const fetchPatch = () => get<PatchResponse>('/api/patch');
export const fetchTierList = (lane: Lane, tier: Tier) =>
  get<TierListResponse>(`/api/tierlist?${new URLSearchParams({ lane, tier })}`);
export const fetchMatchup = (champ: string, lane: Lane, tier: Tier) =>
  get<MatchupResponse>(`/api/matchup?${new URLSearchParams({ champ, lane, tier })}`);
// without a tag the server tries the default EUW tags
export const fetchProfile = (gameName: string, tagLine?: string) =>
  get<ProfileResponse>(`/api/profile/${encodeURIComponent(gameName)}${tagLine ? `/${encodeURIComponent(tagLine)}` : ''}`);
export const fetchLiveGame = (gameName: string, tagLine: string) =>
  get<LiveGameResponse>(`/api/live/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
export const fetchLiveForm = (puuid: string, championKey: number) =>
  get<LiveFormResponse>(`/api/live/form/${encodeURIComponent(puuid)}?champ=${championKey}`);
export const fetchVersus = (champ: string, vs: string, lane: Lane, tier: Tier) =>
  get<VersusResponse | null>(`/api/versus?${new URLSearchParams({ champ, vs, lane, tier })}`);
