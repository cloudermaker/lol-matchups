import { describe, it, expect, vi } from 'vitest';
import type { Champion } from '@lol/shared';
import { TtlCache } from '../src/cache';
import { RiotError } from '../src/riot/client';
import type { RiotActiveGame, RiotMatch, RiotSpectatorParticipant } from '../src/riot/types';
import { LiveService } from '../src/live/service';
import { match, participant } from './fixtures/riot';

const champ = (key: number): Champion => ({ id: `C${key}`, key, name: `C${key}`, icon: `${key}.png` });
const sp = (puuid: string | null, teamId: number, championId: number, smite = false): RiotSpectatorParticipant =>
  ({ puuid, teamId, championId, spell1Id: 4, spell2Id: smite ? 11 : 14, riotId: puuid ? `${puuid}#EUW` : undefined });

const participants = [
  sp('me', 100, 1), sp('a2', 100, 2, true), sp('a3', 100, 3), sp('a4', 100, 4), sp('a5', 100, 5),
  sp('e1', 200, 6), sp('e2', 200, 7, true), sp('e3', 200, 8), sp('e4', 200, 9), sp(null, 200, 10),
];
const game = (o: Partial<RiotActiveGame> = {}): RiotActiveGame => ({ gameId: 1, mapId: 11, gameQueueConfigId: 420, gameStartTime: 99, participants, ...o });

function setup(o: { active?: () => Promise<RiotActiveGame>; league?: (puuid: string) => Promise<unknown[]>; mainLanes?: () => Promise<Record<string, string>> } = {}) {
  const riot = {
    account: vi.fn(async (name: string, tag: string) => ({ puuid: 'me', gameName: name, tagLine: tag })),
    activeGame: vi.fn(o.active ?? (async () => game())),
    leagueEntries: vi.fn((o.league ?? (async () => [{ queueType: 'RANKED_SOLO_5x5', tier: 'EMERALD', rank: 'IV', leaguePoints: 10, wins: 30, losses: 20 }])) as never),
    mastery: vi.fn(async () => 5000),
    matchIds: vi.fn(async () => ['M1', 'M2']),
  };
  const matches: Record<string, RiotMatch> = {
    M1: match('M1', [participant({ puuid: 'e1', championId: 6, win: true })]),
    M2: match('M2', [participant({ puuid: 'e1', championId: 6, win: false })]),
  };
  const store = { get: vi.fn(async (id: string) => matches[id]) };
  const matchups = { getMainLanes: vi.fn(o.mainLanes ?? (async () => ({ C1: 'top', C3: 'middle', C4: 'bottom', C5: 'support', C6: 'top' }))) };
  const service = new LiveService(riot, store, { championByKey: champ }, matchups as never, new TtlCache(30_000), new TtlCache(600_000));
  return { service, riot, store };
}

describe('LiveService.getGame', () => {
  it('builds both teams with ranks, mastery and lanes', async () => {
    const { service } = setup();
    const g = await service.getGame('Me', 'EUW');
    expect(g).toMatchObject({ queueId: 420, gameStartTime: 99, me: 'me', tier: 'emerald_plus' });
    expect(g.allies.map((p) => [p.puuid, p.lane])).toEqual([['me', 'top'], ['a2', 'jungle'], ['a3', 'middle'], ['a4', 'bottom'], ['a5', 'support']]);
    expect(g.allies[0]).toMatchObject({ riotId: 'me#EUW', champion: champ(1), rank: { tier: 'EMERALD', division: 'IV', lp: 10 }, seasonWins: 30, seasonLosses: 20, mastery: 5000, lookupFailed: false });
    expect(g.enemies.map((p) => p.lane)).toEqual(['top', 'jungle', 'middle', 'bottom', 'support']);
  });

  it('skips lookups for hidden players', async () => {
    const { service, riot } = setup();
    const hidden = (await service.getGame('Me', 'EUW')).enemies[4];
    expect(hidden).toMatchObject({ puuid: null, riotId: null, anonymous: true, rank: null, mastery: null });
    expect(riot.leagueEntries).toHaveBeenCalledTimes(9);
  });

  it('marks one failing lookup without failing the game', async () => {
    const { service } = setup({ league: async (puuid) => { if (puuid === 'e1') throw new RiotError('http', 'boom'); return []; } });
    const g = await service.getGame('Me', 'EUW');
    expect(g.enemies[0]).toMatchObject({ lookupFailed: true, rank: null, mastery: null });
    expect(g.allies[0]).toMatchObject({ lookupFailed: false, rank: null, mastery: 5000 });
  });

  it('fails the game on a key error', async () => {
    const { service } = setup({ league: async () => { throw new RiotError('key', 'expired'); } });
    await expect(service.getGame('Me', 'EUW')).rejects.toMatchObject({ kind: 'key' });
  });

  it('passes not_in_game through', async () => {
    const { service } = setup({ active: async () => { throw new RiotError('not_in_game', 'Not in a game'); } });
    await expect(service.getGame('Me', 'EUW')).rejects.toMatchObject({ kind: 'not_in_game' });
  });

  it("leaves lanes empty outside Summoner's Rift", async () => {
    const { service } = setup({ active: async () => game({ mapId: 12 }) });
    const g = await service.getGame('Me', 'EUW');
    expect([...g.allies, ...g.enemies].every((p) => p.lane === null)).toBe(true);
  });

  it('still guesses Smite jungle when main lanes are down', async () => {
    const { service } = setup({ mainLanes: async () => { throw new Error('down'); } });
    expect((await service.getGame('Me', 'EUW')).allies[1].lane).toBe('jungle');
  });

  it('caches the game per Riot ID, case-insensitive', async () => {
    const { service, riot } = setup();
    await service.getGame('Me', 'EUW');
    await service.getGame('me', 'euw');
    expect(riot.activeGame).toHaveBeenCalledTimes(1);
  });
});

describe('LiveService.getForm', () => {
  it('builds the form from the last 10 ranked games and caches it', async () => {
    const { service, riot } = setup();
    expect(await service.getForm('e1', 6)).toEqual({ games: 2, wins: 1, streak: 'W1', kda: 0, champGames: 2, champWins: 1 });
    await service.getForm('e1', 6);
    expect(riot.matchIds).toHaveBeenCalledTimes(1);
    expect(riot.matchIds).toHaveBeenCalledWith('e1', 10);
  });
});
