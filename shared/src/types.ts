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
export interface StatLine { csPerMin: number; deaths: number; visionPerMin: number; damagePerMin: number; goldPerMin: number }
// you/opponents are null below 3 games on this champion and lane
export interface PoolEntry {
  champion: Champion; lane: Lane; games: number; wins: number; winRate: number; kda: number;
  you: StatLine | null; opponents: StatLine | null;
}
export type AdviceKind = 'best' | 'struggling' | 'offrole' | 'counter' | 'build';
export interface Advice { kind: AdviceKind; text: string }
export interface Rank { tier: string; division: string; lp: number }
export interface ProfileResponse {
  riotId: string; rank: Rank | null; tier: Tier; games: number; winRate: number; mainLane: Lane | null;
  pool: PoolEntry[]; advice: Advice[]; lolalyticsAvailable: boolean;
}
