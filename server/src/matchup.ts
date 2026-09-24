import type { Build, BuildResponse, Champion, Counter, Item, Lane, MatchupResponse, TierEntry, TierListResponse } from '@lol/shared';
import type { TtlCache } from './cache';
import type { Provider, RawBuild, RawCounter } from './providers/types';

// hides off-role picks from the lane tier lists
const MIN_LANE_SHARE = 10;

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

  getMatchup(champion: Champion, lane: Lane): Promise<MatchupResponse> {
    return this.cache.getOrLoad(`matchup:${champion.id}:${lane}`, async () => {
      const [raw, build] = await Promise.all([
        this.provider.getCounters(champion.id, lane),
        this.provider.getBuild(champion.id, lane),
      ]);
      const counters: Counter[] = this.enrichStats(raw).sort((a, b) => a.winRate - b.winRate).slice(0, 5);
      return { champion, lane, counters, build: this.enrich(build) };
    });
  }

  getBuild(champion: Champion, lane: Lane, vs?: Champion): Promise<BuildResponse> {
    return this.cache.getOrLoad(`build:${champion.id}:${lane}:${vs?.id ?? ''}`, async () => ({
      build: this.enrich(await this.provider.getBuild(champion.id, lane, vs?.id)),
    }));
  }

  getTierList(lane: Lane): Promise<TierListResponse> {
    return this.cache.getOrLoad(`tierlist:${lane}`, async () => {
      const raw = await this.provider.getTierList(lane);
      const entries = this.enrichStats(raw.filter((e) => e.laneShare >= MIN_LANE_SHARE));
      return {
        lane,
        best: [...entries].sort((a, b) => b.winRate - a.winRate).slice(0, 5),
        worst: [...entries].sort((a, b) => a.winRate - b.winRate).slice(0, 5),
      };
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
