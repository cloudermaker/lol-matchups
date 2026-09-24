import type { Lane } from '@lol/shared';

export interface RawCounter { championKey: number; winRate: number; games: number }
export interface RawBuild { early: string[]; core: string[]; bootsCandidates: string[]; games: number; winRate: number }
// laneShare = % of the champion's games played in this lane
export interface RawTierEntry { championKey: number; winRate: number; games: number; laneShare: number }
export interface Provider {
  getCounters(championId: string, lane: Lane): Promise<RawCounter[]>;
  getBuild(championId: string, lane: Lane, vsChampionId?: string): Promise<RawBuild | null>;
  getTierList(lane: Lane): Promise<RawTierEntry[]>;
}
export class ProviderError extends Error {}
