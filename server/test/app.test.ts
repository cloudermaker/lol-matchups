import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Champion } from '@lol/shared';
import { createApp, type AppDeps } from '../src/app';
import { ProviderError } from '../src/providers/types';

const darius: Champion = { id: 'Darius', key: 122, name: 'Darius', icon: 'd.png' };
const malphite: Champion = { id: 'Malphite', key: 54, name: 'Malphite', icon: 'm.png' };
const all = [darius, malphite];

function deps(overrides: Partial<AppDeps['matchups']> = {}): AppDeps {
  return {
    champions: { champions: () => all, championById: (id) => all.find((c) => c.id.toLowerCase() === id.toLowerCase()) },
    matchups: {
      getMatchup: vi.fn().mockResolvedValue({ champion: darius, lane: 'top', counters: [], build: null }),
      getBuild: vi.fn().mockResolvedValue({ build: null }),
      getTierList: vi.fn().mockResolvedValue({ lane: 'top', best: [], worst: [] }),
      ...overrides,
    },
  };
}

describe('API', () => {
  it('lists champions', async () => {
    const res = await request(createApp(deps())).get('/api/champions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(all);
  });

  it('returns a matchup', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/matchup?champ=darius&lane=top');
    expect(res.status).toBe(200);
    expect(d.matchups.getMatchup).toHaveBeenCalledWith(darius, 'top');
  });

  it('400 on unknown champion, provider not called', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/matchup?champ=zzz&lane=top');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown champion: zzz' });
    expect(d.matchups.getMatchup).not.toHaveBeenCalled();
  });

  it('400 on invalid lane', async () => {
    const res = await request(createApp(deps())).get('/api/matchup?champ=darius&lane=bot');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid lane: bot' });
  });

  it('400 on missing params', async () => {
    const res = await request(createApp(deps())).get('/api/matchup');
    expect(res.status).toBe(400);
  });

  it('502 when provider fails', async () => {
    const res = await request(createApp(deps({ getMatchup: vi.fn().mockRejectedValue(new ProviderError('down')) })))
      .get('/api/matchup?champ=darius&lane=top');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Data source unavailable' });
  });

  it('returns a matchup build', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/build?champ=darius&lane=top&vs=malphite');
    expect(res.status).toBe(200);
    expect(d.matchups.getBuild).toHaveBeenCalledWith(darius, 'top', malphite);
  });

  it('400 on unknown opponent', async () => {
    const res = await request(createApp(deps())).get('/api/build?champ=darius&lane=top&vs=zzz');
    expect(res.status).toBe(400);
  });

  it('returns a lane tier list', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/tierlist?lane=jungle');
    expect(res.status).toBe(200);
    expect(d.matchups.getTierList).toHaveBeenCalledWith('jungle');
  });

  it('400 on invalid tier list lane', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/tierlist?lane=bot');
    expect(res.status).toBe(400);
    expect(d.matchups.getTierList).not.toHaveBeenCalled();
  });
});
