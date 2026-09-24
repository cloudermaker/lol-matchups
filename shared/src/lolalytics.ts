import type { Lane } from './types';

const SLUG_OVERRIDES: Record<string, string> = { MonkeyKing: 'wukong' };

// lolalytics champion slug from a Data Dragon id
export function lolalyticsSlug(id: string): string {
  return SLUG_OVERRIDES[id] ?? id.toLowerCase();
}

export function lolalyticsBuildUrl(id: string, lane: Lane): string {
  return `https://lolalytics.com/lol/${lolalyticsSlug(id)}/build/?${new URLSearchParams({ lane, tier: 'platinum_plus', region: 'euw' })}`;
}
