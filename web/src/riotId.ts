export interface RiotId { gameName: string; tagLine: string }

// split at the last # (tags never contain one)
export function parseRiotId(text: string): RiotId | null {
  const i = text.lastIndexOf('#');
  if (i < 0) return null;
  const gameName = text.slice(0, i).trim();
  const tagLine = text.slice(i + 1).trim();
  return gameName && tagLine ? { gameName, tagLine } : null;
}
