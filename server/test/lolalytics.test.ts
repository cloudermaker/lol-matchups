import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LolalyticsProvider, lolalyticsSlug } from '../src/providers/lolalytics';
import { ProviderError } from '../src/providers/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const byEp: Record<string, unknown> = {
  counter: fixture('counter-darius-top.json'),
  'build-itemset': fixture('itemset-darius-top.json'),
  'build-earlyset': fixture('earlyset-darius-top.json'),
  list: fixture('list-top.json'),
};

function recordingFetch(body?: unknown) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    return body ?? byEp[new URL(url).searchParams.get('ep')!];
  };
  return { fn, urls };
}

describe('lolalyticsSlug', () => {
  it('lower-cases ids and maps Wukong', () => {
    expect(lolalyticsSlug('Darius')).toBe('darius');
    expect(lolalyticsSlug('DrMundo')).toBe('drmundo');
    expect(lolalyticsSlug('KSante')).toBe('ksante');
    expect(lolalyticsSlug('MonkeyKing')).toBe('wukong');
  });
});

describe('LolalyticsProvider', () => {
  it('builds the EUW Platinum+ counter URL', async () => {
    const { fn, urls } = recordingFetch();
    await new LolalyticsProvider(fn).getCounters('MonkeyKing', 'top');
    const q = new URL(urls[0]).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      ep: 'counter', c: 'wukong', lane: 'top', tier: 'platinum_plus', queue: 'ranked', region: 'euw',
    });
  });

  it('normalises counters', async () => {
    const counters = await new LolalyticsProvider(recordingFetch().fn).getCounters('Darius', 'top');
    expect(counters).toHaveLength(127);
    expect(counters).toContainEqual({ championKey: 62, winRate: 46.18, games: 2984 });
  });

  it('throws ProviderError on {"status":404}', async () => {
    const p = new LolalyticsProvider(recordingFetch({ status: 404 }).fn);
    await expect(p.getCounters('Zzz', 'top')).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on network failure', async () => {
    const p = new LolalyticsProvider(async () => { throw new Error('ECONNRESET'); });
    await expect(p.getCounters('Darius', 'top')).rejects.toBeInstanceOf(ProviderError);
  });

  it('normalises the general build', async () => {
    const build = await new LolalyticsProvider(recordingFetch().fn).getBuild('Darius', 'top');
    expect(build).toEqual({
      early: ['1055', '1001', '1029', '1036', '3047'],
      core: ['3142', '3742', '6333'],
      bootsCandidates: expect.arrayContaining(['3047', '3111']),
      games: 5062,
      winRate: 57.65,
    });
    expect(build!.bootsCandidates.slice(0, 2)).toEqual(['3047', '3142']);
  });

  it('returns null for matchup builds (no endpoint yet)', async () => {
    const { fn, urls } = recordingFetch();
    expect(await new LolalyticsProvider(fn).getBuild('Darius', 'top', 'Malphite')).toBeNull();
    expect(urls).toHaveLength(0);
  });

  it('normalises the lane tier list', async () => {
    const { fn, urls } = recordingFetch();
    const list = await new LolalyticsProvider(fn).getTierList('top');
    const q = Object.fromEntries(new URL(urls[0]).searchParams);
    expect(q).toMatchObject({ ep: 'list', lane: 'top', tier: 'platinum_plus', region: 'euw' });
    expect(q.c).toBeUndefined();
    expect(list).toHaveLength(173);
    expect(list).toContainEqual({ championKey: 26, winRate: 55.03, games: 7921, laneShare: 7.58 });
  });

  it('throws ProviderError on an unexpected tier list shape', async () => {
    const p = new LolalyticsProvider(recordingFetch({ fields: [] }).fn);
    await expect(p.getTierList('top')).rejects.toBeInstanceOf(ProviderError);
  });
});
