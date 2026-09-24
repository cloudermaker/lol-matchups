export const LANES = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;
export type Lane = (typeof LANES)[number];

export const TIERS = ['gold_plus', 'platinum_plus', 'emerald_plus'] as const;
export type Tier = (typeof TIERS)[number];
export const DEFAULT_TIER: Tier = 'platinum_plus';
export const TIER_LABELS: Record<Tier, string> = { gold_plus: 'Gold+', platinum_plus: 'Platinum+', emerald_plus: 'Emerald+' };

export interface Champion { id: string; key: number; name: string; icon: string }
export interface Item { id: string; name: string; icon: string }
export interface Counter { champion: Champion; winRate: number; games: number }
export interface Build { early: Item[]; core: Item[]; boots: Item | null; games: number; winRate: number }
export interface MatchupResponse { champion: Champion; lane: Lane; tier: Tier; counters: Counter[]; build: Build | null }
export interface TierEntry { champion: Champion; winRate: number; games: number }
export interface TierListResponse { lane: Lane; tier: Tier; best: TierEntry[]; worst: TierEntry[] }
// champion id -> main lane
export type MainLanesResponse = Record<string, Lane>;
export interface ErrorResponse { error: string }
