import type { Build, Champion, Counter, Item, Lane, MainLanesResponse, MatchupResponse, Tier, TierEntry, TierListResponse } from '@lol/shared';
import type { TtlCache } from './cache';
import type { Provider, RawBuild, RawCounter } from './providers/types';

// hides off-role picks from the lane tier lists
const MIN_LANE_SHARE = 10;
const COUNTERS_SHOWN = 10;

export interface Catalog {
  championByKey(key: number): Champion | undefined;
  item(id: string): Item | undefined;
  isBoots(id: string): boolean;
}

export class MatchupService {
  constructor(
    private provider: Provider,
    private catalog: Catalog,
    private cache: TtlCache,
    private minGames: number,
  ) {}

  getMatchup(champion: Champion, lane: Lane, tier: Tier): Promise<MatchupResponse> {
    return this.cache.getOrLoad(`matchup:${champion.id}:${lane}:${tier}`, async () => {
      const [raw, build] = await Promise.all([
        this.provider.getCounters(champion.id, lane, tier),
        this.provider.getBuild(champion.id, lane, tier),
      ]);
      const counters: Counter[] = this.enrichStats(raw).sort((a, b) => a.winRate - b.winRate).slice(0, COUNTERS_SHOWN);
      return { champion, lane, tier, counters, build: this.enrich(build) };
    });
  }

  getTierList(lane: Lane, tier: Tier): Promise<TierListResponse> {
    return this.cache.getOrLoad(`tierlist:${lane}:${tier}`, async () => {
      const raw = await this.provider.getTierList(lane, tier);
      const entries = this.enrichStats(raw.filter((e) => e.laneShare >= MIN_LANE_SHARE));
      return {
        lane,
        tier,
        best: [...entries].sort((a, b) => b.winRate - a.winRate).slice(0, 5),
        worst: [...entries].sort((a, b) => a.winRate - b.winRate).slice(0, 5),
      };
    });
  }

  getMainLanes(): Promise<MainLanesResponse> {
    return this.cache.getOrLoad('mainlanes', async () => {
      const lanes: MainLanesResponse = {};
      for (const [key, lane] of Object.entries(await this.provider.getMainLanes())) {
        const champion = this.catalog.championByKey(Number(key));
        if (champion) lanes[champion.id] = lane;
      }
      return lanes;
    });
  }

  // drop low-sample and unknown champions, attach names/icons
  private enrichStats(raw: RawCounter[]): TierEntry[] {
    return raw
      .filter((c) => c.games >= this.minGames)
      .flatMap((c) => {
        const champion = this.catalog.championByKey(c.championKey);
        return champion ? [{ champion, winRate: c.winRate, games: c.games }] : [];
      });
  }

  private enrich(raw: RawBuild | null): Build | null {
    if (!raw) return null;
    const items = (ids: string[]) => ids.flatMap((id) => this.catalog.item(id) ?? []);
    const bootsId = raw.bootsCandidates.find((id) => this.catalog.isBoots(id));
    return {
      early: items(raw.early),
      core: items(raw.core),
      boots: bootsId ? (this.catalog.item(bootsId) ?? null) : null,
      games: raw.games,
      winRate: raw.winRate,
    };
  }
}
