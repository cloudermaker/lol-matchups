import { RateLimiter, realSleep, type Sleep } from './rateLimiter';
import type { RiotAccount, RiotLeagueEntry, RiotMatch } from './types';

const REGION = 'https://europe.api.riotgames.com';
const PLATFORM = 'https://euw1.api.riotgames.com';
const RANKED_SOLO = 420;

export type RiotErrorKind = 'not_found' | 'key' | 'busy' | 'http';
export class RiotError extends Error {
  constructor(public kind: RiotErrorKind, message: string) { super(message); }
}

export interface RiotResponse { status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }
export type RiotFetch = (url: string, init: { headers: Record<string, string> }) => Promise<RiotResponse>;

// personal key limits
const personalKeyLimiter = () => new RateLimiter([{ limit: 20, windowMs: 1000 }, { limit: 100, windowMs: 120_000 }]);

export class RiotClient {
  constructor(
    private apiKey: string | undefined,
    private fetchFn: RiotFetch = fetch,
    private limiter: RateLimiter = personalKeyLimiter(),
    private sleep: Sleep = realSleep,
  ) {}

  account(gameName: string, tagLine: string): Promise<RiotAccount> {
    return this.get(`${REGION}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`) as Promise<RiotAccount>;
  }

  matchIds(puuid: string, count: number): Promise<string[]> {
    return this.get(`${REGION}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO}&count=${count}`) as Promise<string[]>;
  }

  match(id: string): Promise<RiotMatch> {
    return this.get(`${REGION}/lol/match/v5/matches/${id}`) as Promise<RiotMatch>;
  }

  leagueEntries(puuid: string): Promise<RiotLeagueEntry[]> {
    return this.get(`${PLATFORM}/lol/league/v4/entries/by-puuid/${puuid}`) as Promise<RiotLeagueEntry[]>;
  }

  private async get(url: string, retried = false): Promise<unknown> {
    if (!this.apiKey) throw new RiotError('key', 'Riot API key missing or expired');
    await this.limiter.acquire();
    const res = await this.fetchFn(url, { headers: { 'X-Riot-Token': this.apiKey } });
    if (res.status === 429) {
      if (retried) throw new RiotError('busy', 'Riot API busy, try again in a minute');
      const seconds = Number(res.headers.get('Retry-After'));
      await this.sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      return this.get(url, true);
    }
    if (res.status === 404) throw new RiotError('not_found', 'Not found');
    if (res.status === 401 || res.status === 403) throw new RiotError('key', 'Riot API key missing or expired');
    if (res.status < 200 || res.status >= 300) throw new RiotError('http', `Riot API HTTP ${res.status}`);
    return res.json();
  }
}
