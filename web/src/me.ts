const KEY = 'me';

// browser-only convenience; storage may be blocked
export function readMe(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.includes('#') ? value : null;
  } catch {
    return null;
  }
}

export function saveMe(riotId: string): string {
  try { localStorage.setItem(KEY, riotId); } catch { /* storage blocked */ }
  return riotId;
}
