import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LolalyticsProvider, lolalyticsSlug } from '../src/providers/lolalytics';
import { ProviderError } from '../src/providers/types';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const byEp: Record<string, unknown> = {
  counter: fixture('counter-darius-top.json'),
  'build-itemset': fixture('itemset-darius-top.json'),
  'build-earlyset': fixture('earlyset-darius-top.json'),
};
const lists: Record<string, unknown> = { top: fixture('list-top.json'), all: fixture('list-all.json') };

function recordingFetch(body?: unknown) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    return body ?? (q.get('ep') === 'list' ? lists[q.get('lane')!] : byEp[q.get('ep')!]);
  };
  return { fn, urls };
}
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe('lolalyticsSlug', () => {
  it('lower-cases ids and maps Wukong', () => {
    expect(lolalyticsSlug('Darius')).toBe('darius');
    expect(lolalyticsSlug('DrMundo')).toBe('drmundo');
    expect(lolalyticsSlug('KSante')).toBe('ksante');
    expect(lolalyticsSlug('MonkeyKing')).toBe('wukong');
  });
});

describe('LolalyticsProvider', () => {
  it('builds the EUW counter URL with the requested tier', async () => {
    const { fn, urls } = recordingFetch();
    await new LolalyticsProvider(fn).getCounters('MonkeyKing', 'top', 'emerald_plus');
    expect(params(urls[0])).toMatchObject({
      ep: 'counter', c: 'wukong', lane: 'top', tier: 'emerald_plus', queue: 'ranked', region: 'euw',
    });
  });

  it('normalises counters', async () => {
    const counters = await new LolalyticsProvider(recordingFetch().fn).getCounters('Darius', 'top', 'platinum_plus');
    expect(counters).toHaveLength(127);
    expect(counters).toContainEqual({ championKey: 62, winRate: 46.18, games: 2984 });
  });

  it('throws ProviderError on {"status":404}', async () => {
    const p = new LolalyticsProvider(recordingFetch({ status: 404 }).fn);
    await expect(p.getCounters('Zzz', 'top', 'platinum_plus')).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on network failure', async () => {
    const p = new LolalyticsProvider(async () => { throw new Error('ECONNRESET'); });
    await expect(p.getCounters('Darius', 'top', 'platinum_plus')).rejects.toBeInstanceOf(ProviderError);
  });

  it('normalises the build and passes the tier', async () => {
    const { fn, urls } = recordingFetch();
    const build = await new LolalyticsProvider(fn).getBuild('Darius', 'top', 'emerald_plus');
    expect(build).toEqual({
      early: ['1055', '1001', '1029', '1036', '3047'],
      core: ['3142', '3742', '6333'],
      bootsCandidates: expect.arrayContaining(['3047', '3111']),
      games: 5062,
      winRate: 57.65,
    });
    expect(build!.bootsCandidates.slice(0, 2)).toEqual(['3047', '3142']);
    expect(urls.map((u) => params(u).tier)).toEqual(['emerald_plus', 'emerald_plus']);
  });

  it('normalises the lane tier list', async () => {
    const { fn, urls } = recordingFetch();
    const list = await new LolalyticsProvider(fn).getTierList('top', 'platinum_plus');
    const q = params(urls[0]);
    expect(q).toMatchObject({ ep: 'list', lane: 'top', tier: 'platinum_plus', region: 'euw' });
    expect(q.c).toBeUndefined();
    expect(list).toHaveLength(173);
    expect(list).toContainEqual({ championKey: 26, winRate: 55.03, games: 7921, laneShare: 7.58 });
  });

  it('throws ProviderError on an unexpected tier list shape', async () => {
    const p = new LolalyticsProvider(recordingFetch({ fields: [] }).fn);
    await expect(p.getTierList('top', 'platinum_plus')).rejects.toBeInstanceOf(ProviderError);
  });

  it('reads each champion main lane from the all-lanes list', async () => {
    const { fn, urls } = recordingFetch();
    const lanes = await new LolalyticsProvider(fn).getMainLanes();
    expect(params(urls[0])).toMatchObject({ ep: 'list', lane: 'all', tier: 'platinum_plus', region: 'euw' });
    expect(lanes[122]).toBe('top');
    expect(lanes[64]).toBe('jungle');
    expect(Object.keys(lanes)).toHaveLength(173);
  });
});
