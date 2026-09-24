const KEY = 'recentPlayers';
const MAX = 5;

// browser-only convenience; storage may be blocked or corrupt
export function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(riotId: string): string[] {
  const next = [riotId, ...readRecent().filter((r) => r.toLowerCase() !== riotId.toLowerCase())].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}
