import { DEFAULT_TIER, LANES, lolalyticsSlug, type Lane, type Tier } from '@lol/shared';
import type { FetchJson } from '../http';
import { ProviderError, type Provider, type RawBuild, type RawCounter, type RawTierEntry } from './types';

const BASE = 'https://a1.lolalytics.com/mega/';

type SetEntry = [ids: string, games: number, wins: number];

export { lolalyticsSlug };

const round2 = (n: number) => Math.round(n * 100) / 100;

export class LolalyticsProvider implements Provider {
  constructor(private fetchJson: FetchJson) {}

  private async get<T>(ep: string, championId: string | null, lane: Lane | 'all', tier: Tier): Promise<T> {
    const q = new URLSearchParams({
      ep, v: '1', patch: '30', ...(championId ? { c: lolalyticsSlug(championId) } : {}), lane,
      tier, queue: 'ranked', region: 'euw',
    });
    let body: unknown;
    try {
      body = await this.fetchJson(`${BASE}?${q}`);
    } catch (e) {
      throw new ProviderError(`lolalytics ${ep} failed: ${(e as Error).message}`);
    }
    if (!body || typeof body !== 'object' || 'status' in body) {
      throw new ProviderError(`lolalytics ${ep}: no data for ${championId ?? 'all'}/${lane}`);
    }
    return body as T;
  }

  async getCounters(championId: string, lane: Lane, tier: Tier): Promise<RawCounter[]> {
    const body = await this.get<{ counters?: { cid: number; vsWr: number; n: number }[] }>('counter', championId, lane, tier);
    if (!Array.isArray(body.counters)) throw new ProviderError('lolalytics counter: unexpected shape');
    return body.counters.map((c) => ({ championKey: c.cid, winRate: c.vsWr, games: c.n }));
  }

  async getTierList(lane: Lane, tier: Tier): Promise<RawTierEntry[]> {
    const body = await this.get<{ cid?: Record<string, { wr: number; games: number; pctLane: number }> }>('list', null, lane, tier);
    if (!body.cid || typeof body.cid !== 'object') throw new ProviderError('lolalytics list: unexpected shape');
    return Object.entries(body.cid).map(([key, c]) => ({ championKey: Number(key), winRate: c.wr, games: c.games, laneShare: c.pctLane }));
  }

  async getMainLanes(): Promise<Record<number, Lane>> {
    const body = await this.get<{ cid?: Record<string, { lane: string }> }>('list', null, 'all', DEFAULT_TIER);
    if (!body.cid || typeof body.cid !== 'object') throw new ProviderError('lolalytics list: unexpected shape');
    const lanes: Record<number, Lane> = {};
    for (const [key, c] of Object.entries(body.cid)) {
      if (LANES.includes(c.lane as Lane)) lanes[Number(key)] = c.lane as Lane;
    }
    return lanes;
  }

  async getBuild(championId: string, lane: Lane, tier: Tier): Promise<RawBuild | null> {
    const [items, early] = await Promise.all([
      this.get<{ itemSets?: Record<string, SetEntry[]> }>('build-itemset', championId, lane, tier),
      this.get<{ earlySet?: [string, number, number, number][] }>('build-earlyset', championId, lane, tier),
    ]);
    const sets = items.itemSets;
    const core = sets?.itemSet3?.slice().sort((a, b) => b[1] - a[1])[0];
    if (!sets || !core) return null;

    // sum games per item across all boot-inclusive sets
    const bootGames = new Map<string, number>();
    for (const [name, entries] of Object.entries(sets)) {
      if (!name.startsWith('itemBootSet')) continue;
      for (const [ids, games] of entries) {
        for (const id of ids.split('_')) bootGames.set(id, (bootGames.get(id) ?? 0) + games);
      }
    }
    const topEarly = early.earlySet?.slice().sort((a, b) => b[3] - a[3])[0];

    return {
      early: topEarly ? topEarly[0].split('_') : [],
      core: core[0].split('_'),
      bootsCandidates: [...bootGames.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
      games: core[1],
      winRate: round2((core[2] / core[1]) * 100),
    };
  }
}
