import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchStore } from '../src/riot/matchStore';
import type { RiotMatch } from '../src/riot/types';

const match = (id: string): RiotMatch => ({ metadata: { matchId: id }, info: { gameDuration: 1800, queueId: 420, participants: [] } });
let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'matches-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('MatchStore', () => {
  it('fetches a missing match and writes it to disk', async () => {
    const fetchMatch = vi.fn(async (id: string) => match(id));
    const store = new MatchStore(join(dir, 'nested'), fetchMatch);
    expect(await store.get('EUW1_1')).toEqual(match('EUW1_1'));
    expect(JSON.parse(await readFile(join(dir, 'nested', 'EUW1_1.json'), 'utf8'))).toEqual(match('EUW1_1'));
  });

  it('reads a cached match without fetching', async () => {
    await writeFile(join(dir, 'EUW1_2.json'), JSON.stringify(match('EUW1_2')));
    const fetchMatch = vi.fn(async (id: string) => match(id));
    expect(await new MatchStore(dir, fetchMatch).get('EUW1_2')).toEqual(match('EUW1_2'));
    expect(fetchMatch).not.toHaveBeenCalled();
  });

  it('replaces a corrupt file', async () => {
    await writeFile(join(dir, 'EUW1_3.json'), '{not json');
    const fetchMatch = vi.fn(async (id: string) => match(id));
    expect(await new MatchStore(dir, fetchMatch).get('EUW1_3')).toEqual(match('EUW1_3'));
    expect(fetchMatch).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(join(dir, 'EUW1_3.json'), 'utf8'))).toEqual(match('EUW1_3'));
  });

  it('rejects ids that are not Riot match ids', async () => {
    const store = new MatchStore(dir, vi.fn());
    await expect(store.get('../secret')).rejects.toThrow('Invalid match id');
  });
});
