export const LANES = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;
export type Lane = (typeof LANES)[number];

export interface Champion { id: string; key: number; name: string; icon: string }
export interface Item { id: string; name: string; icon: string }
export interface Counter { champion: Champion; winRate: number; games: number }
export interface Build { early: Item[]; core: Item[]; boots: Item | null; games: number; winRate: number }
export interface MatchupResponse { champion: Champion; lane: Lane; counters: Counter[]; build: Build | null }
export interface TierEntry { champion: Champion; winRate: number; games: number }
export interface TierListResponse { lane: Lane; best: TierEntry[]; worst: TierEntry[] }
export interface BuildResponse { build: Build | null }
export interface ErrorResponse { error: string }
