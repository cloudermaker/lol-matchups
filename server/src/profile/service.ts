import type { Champion, PoolEntry, ProfileResponse, Rank, Tier } from '@lol/shared';
import type { TtlCache } from '../cache';
import type { MatchupService } from '../matchup';
import { RiotError, type RiotClient } from '../riot/client';
import type { RiotMatch } from '../riot/types';
import { buildAdvice, laneKey, type LaneData } from './advice';
import { buildPool, mainLane, tierForRank, toGames, type PoolRow } from './aggregate';

const MATCH_COUNT = 50;
const PARALLEL_FETCHES = 5;
const LOOKUP_MIN_GAMES = 2;
// tried in order when no tag is given
const DEFAULT_TAGS = ['EUW', 'EUR'];

export interface ProfileCatalog {
  championByKey(key: number): Champion | undefined;
  item(id: string): { name: string } | undefined;
}

export class ProfileService {
  // loads in progress, so concurrent requests share one set of Riot calls
  private pending = new Map<string, Promise<ProfileResponse>>();

  constructor(
    private riot: Pick<RiotClient, 'account' | 'matchIds' | 'leagueEntries'>,
    private matches: { get(id: string): Promise<RiotMatch> },
    private catalog: ProfileCatalog,
    private matchups: Pick<MatchupService, 'getMatchup'>,
    private cache: TtlCache,
  ) {}

  getProfile(gameName: string, tagLine: string): Promise<ProfileResponse> {
    const key = `profile:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
    const running = this.pending.get(key);
    if (running) return running;
    const load = this.cache.getOrLoad(key, () => this.load(gameName, tagLine)).finally(() => this.pending.delete(key));
    this.pending.set(key, load);
    return load;
  }

  // first tag with ranked games wins, else the first account found
  async findProfile(gameName: string): Promise<ProfileResponse> {
    let empty: ProfileResponse | null = null;
    for (const tag of DEFAULT_TAGS) {
      try {
        const profile = await this.getProfile(gameName, tag);
        if (profile.games > 0) return profile;
        empty ??= profile;
      } catch (e) {
        if (!(e instanceof RiotError && e.kind === 'not_found')) throw e;
      }
    }
    if (empty) return empty;
    throw new RiotError('not_found', `No EUW account for ${DEFAULT_TAGS.map((t) => `${gameName}#${t}`).join(' or ')}`);
  }

  private async load(gameName: string, tagLine: string): Promise<ProfileResponse> {
    const account = await this.riot.account(gameName, tagLine);
    const [ids, entries] = await Promise.all([this.riot.matchIds(account.puuid, MATCH_COUNT), this.riot.leagueEntries(account.puuid)]);
    const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
    const rank: Rank | null = solo ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : null;
    const tier = tierForRank(solo?.tier);

    const fetched = await mapLimit(ids, PARALLEL_FETCHES, (id) => this.fetchMatch(id));
    const games = toGames(account.puuid, fetched.filter((m): m is RiotMatch => m !== null));
    const rows = buildPool(games);
    const { laneData, available } = await this.lookupLanes(rows, tier);
    const lane = mainLane(games);

    return {
      riotId: `${account.gameName}#${account.tagLine}`,
      rank, tier,
      games: games.length,
      winRate: games.length ? Math.round((games.filter((g) => g.win).length / games.length) * 100) : 0,
      mainLane: lane,
      pool: rows.flatMap((r) => this.entry(r)),
      advice: buildAdvice({
        games, pool: rows, mainLane: lane, laneData,
        championName: (key) => this.catalog.championByKey(key)?.name ?? `#${key}`,
        itemName: (id) => this.catalog.item(String(id))?.name ?? `#${id}`,
      }),
      lolalyticsAvailable: available,
    };
  }

  // a deleted match must not read as "account not found"
  private fetchMatch(id: string): Promise<RiotMatch | null> {
    return this.matches.get(id).catch((e) => {
      if (e instanceof RiotError && e.kind === 'not_found') return null;
      throw e;
    });
  }

  private entry(r: PoolRow): PoolEntry[] {
    const champion = this.catalog.championByKey(r.championKey);
    if (!champion) return [];
    return [{ champion, lane: r.lane, games: r.games, wins: r.wins, winRate: Math.round((r.wins / r.games) * 100), kda: r.kda, you: r.you, opponents: r.opponents }];
  }

  // lolalytics counters and core build per played champion and lane
  private async lookupLanes(rows: PoolRow[], tier: Tier): Promise<{ laneData: Map<string, LaneData>; available: boolean }> {
    const laneData = new Map<string, LaneData>();
    let available = true;
    await Promise.all(rows.filter((r) => r.games >= LOOKUP_MIN_GAMES).map(async (r) => {
      const champion = this.catalog.championByKey(r.championKey);
      if (!champion) return;
      try {
        const m = await this.matchups.getMatchup(champion, r.lane, tier);
        laneData.set(laneKey(r.championKey, r.lane), {
          counterKeys: m.counters.map((c) => c.champion.key),
          coreItems: m.build?.core.map((i) => Number(i.id)) ?? [],
        });
      } catch {
        available = false;
      }
    }));
    return { laneData, available };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
