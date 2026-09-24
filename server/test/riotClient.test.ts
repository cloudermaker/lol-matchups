import { describe, it, expect, vi } from 'vitest';
import { RiotClient, RiotError, type RiotFetch, type RiotResponse } from '../src/riot/client';
import { RateLimiter } from '../src/riot/rateLimiter';

const ok = (body: unknown): RiotResponse => ({ status: 200, headers: { get: () => null }, json: async () => body });
const status = (code: number, retryAfter?: string): RiotResponse => ({
  status: code, headers: { get: (n) => (n === 'Retry-After' ? (retryAfter ?? null) : null) }, json: async () => ({}),
});

function setup(responses: RiotResponse[], key: string | undefined = 'k') {
  const fetchFn = vi.fn<RiotFetch>();
  for (const r of responses) fetchFn.mockResolvedValueOnce(r);
  const sleep = vi.fn(async (_ms: number) => {});
  const client = new RiotClient(key, fetchFn, new RateLimiter([{ limit: 1000, windowMs: 1 }]), sleep);
  return { client, fetchFn, sleep };
}

const kind = (p: Promise<unknown>) => p.then(() => 'resolved', (e) => (e instanceof RiotError ? e.kind : 'other'));

describe('RiotClient', () => {
  it('looks up an account on the europe route with the key', async () => {
    const { client, fetchFn } = setup([ok({ puuid: 'p', gameName: 'Mr Noodle', tagLine: 'EUW' })]);
    expect(await client.account('Mr Noodle', 'EUW')).toEqual({ puuid: 'p', gameName: 'Mr Noodle', tagLine: 'EUW' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Mr%20Noodle/EUW',
      { headers: { 'X-Riot-Token': 'k' } },
    );
  });

  it('asks for ranked Solo/Duo match ids', async () => {
    const { client, fetchFn } = setup([ok(['EUW1_1'])]);
    expect(await client.matchIds('p', 50)).toEqual(['EUW1_1']);
    expect(fetchFn.mock.calls[0][0]).toBe('https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/p/ids?queue=420&count=50');
  });

  it('reads league entries on the euw1 route', async () => {
    const { client, fetchFn } = setup([ok([])]);
    await client.leagueEntries('p');
    expect(fetchFn.mock.calls[0][0]).toBe('https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/p');
  });

  it('maps 404 to not_found', async () => {
    expect(await kind(setup([status(404)]).client.account('a', 'b'))).toBe('not_found');
  });

  it('maps 401 and 403 to key', async () => {
    expect(await kind(setup([status(401)]).client.account('a', 'b'))).toBe('key');
    expect(await kind(setup([status(403)]).client.account('a', 'b'))).toBe('key');
  });

  it('fails with key when no key is set, without calling Riot', async () => {
    const { client, fetchFn } = setup([], '');
    expect(await kind(client.account('a', 'b'))).toBe('key');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('waits Retry-After and retries once on 429', async () => {
    const { client, sleep } = setup([status(429, '2'), ok(['EUW1_1'])]);
    expect(await client.matchIds('p', 50)).toEqual(['EUW1_1']);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('fails with busy after a second 429', async () => {
    expect(await kind(setup([status(429), status(429)]).client.matchIds('p', 50))).toBe('busy');
  });

  it('maps other errors to http', async () => {
    expect(await kind(setup([status(500)]).client.match('EUW1_1'))).toBe('http');
  });
});
