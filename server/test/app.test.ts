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
      getMatchup: vi.fn().mockResolvedValue({ champion: darius, lane: 'top', tier: 'platinum_plus', counters: [], build: null }),
      getTierList: vi.fn().mockResolvedValue({ lane: 'top', tier: 'platinum_plus', best: [], worst: [] }),
      getMainLanes: vi.fn().mockResolvedValue({ Darius: 'top' }),
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

  it('returns a matchup with the default tier', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/matchup?champ=darius&lane=top');
    expect(res.status).toBe(200);
    expect(d.matchups.getMatchup).toHaveBeenCalledWith(darius, 'top', 'platinum_plus');
  });

  it('passes the requested tier', async () => {
    const d = deps();
    await request(createApp(d)).get('/api/matchup?champ=darius&lane=top&tier=emerald_plus');
    expect(d.matchups.getMatchup).toHaveBeenCalledWith(darius, 'top', 'emerald_plus');
  });

  it('accepts the Gold+ tier', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/tierlist?lane=top&tier=gold_plus');
    expect(res.status).toBe(200);
    expect(d.matchups.getTierList).toHaveBeenCalledWith('top', 'gold_plus');
  });

  it('400 on invalid tier', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/matchup?champ=darius&lane=top&tier=iron');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid tier: iron' });
    expect(d.matchups.getMatchup).not.toHaveBeenCalled();
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

  it('no longer serves matchup builds', async () => {
    const res = await request(createApp(deps())).get('/api/build?champ=darius&lane=top&vs=malphite');
    expect(res.status).toBe(404);
  });

  it('returns a lane tier list with the requested tier', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/tierlist?lane=jungle&tier=emerald_plus');
    expect(res.status).toBe(200);
    expect(d.matchups.getTierList).toHaveBeenCalledWith('jungle', 'emerald_plus');
  });

  it('400 on invalid tier list lane', async () => {
    const d = deps();
    const res = await request(createApp(d)).get('/api/tierlist?lane=bot');
    expect(res.status).toBe(400);
    expect(d.matchups.getTierList).not.toHaveBeenCalled();
  });

  it('returns champion main lanes', async () => {
    const res = await request(createApp(deps())).get('/api/main-lanes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ Darius: 'top' });
  });
});
