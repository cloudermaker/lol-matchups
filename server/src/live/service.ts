import type { Champion, LiveFormResponse, LiveGameResponse, LivePlayer, MainLanesResponse } from '@lol/shared';
import type { TtlCache } from '../cache';
import { mapLimit } from '../mapLimit';
import type { MatchupService } from '../matchup';
import { tierForRank } from '../profile/aggregate';
import { RiotError, type RiotClient } from '../riot/client';
import type { RiotMatch, RiotSpectatorParticipant } from '../riot/types';
import { buildForm } from './form';
import { guessLanes } from './lanes';

const FORM_GAMES = 10;
const PARALLEL_FETCHES = 5;
const SUMMONERS_RIFT = 11;

export interface LiveCatalog { championByKey(key: number): Champion | undefined }

export class LiveService {
  // loads in progress, so concurrent requests share one set of Riot calls
  private pending = new Map<string, Promise<unknown>>();

  constructor(
    private riot: Pick<RiotClient, 'account' | 'activeGame' | 'leagueEntries' | 'mastery' | 'matchIds'>,
    private matches: { get(id: string): Promise<RiotMatch> },
    private catalog: LiveCatalog,
    private matchups: Pick<MatchupService, 'getMainLanes'>,
    private gameCache: TtlCache,
    private formCache: TtlCache,
  ) {}

  getGame(gameName: string, tagLine: string): Promise<LiveGameResponse> {
    return this.shared(this.gameCache, `live:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`, () => this.loadGame(gameName, tagLine));
  }

  getForm(puuid: string, championKey: number): Promise<LiveFormResponse> {
    return this.shared(this.formCache, `form:${puuid}:${championKey}`, () => this.loadForm(puuid, championKey));
  }

  private shared<T>(cache: TtlCache, key: string, load: () => Promise<T>): Promise<T> {
    const running = this.pending.get(key) as Promise<T> | undefined;
    if (running) return running;
    const p = cache.getOrLoad(key, load).finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  private async loadGame(gameName: string, tagLine: string): Promise<LiveGameResponse> {
    const account = await this.riot.account(gameName, tagLine);
    const game = await this.riot.activeGame(account.puuid);
    const [mainLanes, players] = await Promise.all([
      // lanes still get the Smite guess without lolalytics
      this.matchups.getMainLanes().catch((): MainLanesResponse => ({})),
      Promise.all(game.participants.map((p) => this.player(p))),
    ]);
    // hidden searched player: fall back to the blue side
    const myTeam = game.participants.find((p) => p.puuid === account.puuid)?.teamId ?? 100;
    const team = (mine: boolean) => {
      const list = players.filter((_, i) => (game.participants[i].teamId === myTeam) === mine);
      const lanes = game.mapId === SUMMONERS_RIFT ? guessLanes(list, mainLanes) : list.map(() => null);
      return list.map((p, i) => ({ ...p, lane: lanes[i] }));
    };
    const me = players.find((p) => p.puuid === account.puuid);
    return {
      queueId: game.gameQueueConfigId,
      gameStartTime: game.gameStartTime,
      me: account.puuid,
      tier: tierForRank(me?.rank?.tier),
      allies: team(true),
      enemies: team(false),
    };
  }

  private async player(p: RiotSpectatorParticipant): Promise<LivePlayer> {
    const champion = this.catalog.championByKey(p.championId) ?? { id: String(p.championId), key: p.championId, name: `#${p.championId}`, icon: '' };
    const base: LivePlayer = {
      puuid: p.puuid || null, riotId: p.riotId || null, anonymous: false, champion, spells: [p.spell1Id, p.spell2Id], lane: null,
      rank: null, seasonWins: null, seasonLosses: null, mastery: null, lookupFailed: false,
    };
    if (!p.puuid || p.bot) return { ...base, puuid: null, riotId: null, anonymous: true };
    try {
      const [entries, mastery] = await Promise.all([this.riot.leagueEntries(p.puuid), this.riot.mastery(p.puuid, p.championId)]);
      const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
      return {
        ...base, mastery,
        rank: solo ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : null,
        seasonWins: solo?.wins ?? null,
        seasonLosses: solo?.losses ?? null,
      };
    } catch (e) {
      // a dead key fails the whole page; anything else only this card
      if (e instanceof RiotError && e.kind === 'key') throw e;
      return { ...base, lookupFailed: true };
    }
  }

  private async loadForm(puuid: string, championKey: number): Promise<LiveFormResponse> {
    const ids = await this.riot.matchIds(puuid, FORM_GAMES);
    const fetched = await mapLimit(ids, PARALLEL_FETCHES, (id) => this.matches.get(id).catch((e) => {
      if (e instanceof RiotError && e.kind === 'not_found') return null;
      throw e;
    }));
    return buildForm(puuid, fetched.filter((m): m is RiotMatch => m !== null), championKey);
  }
}
