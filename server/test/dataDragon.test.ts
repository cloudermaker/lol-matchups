import { describe, it, expect } from 'vitest';
import { DataDragon } from '../src/dataDragon';

const CDN = 'https://ddragon.leagueoflegends.com';
const responses: Record<string, unknown> = {
  [`${CDN}/api/versions.json`]: ['16.19.1', '16.18.1'],
  [`${CDN}/cdn/16.19.1/data/en_US/champion.json`]: {
    data: {
      Darius: { id: 'Darius', key: '122', name: 'Darius', image: { full: 'Darius.png' } },
      MonkeyKing: { id: 'MonkeyKing', key: '62', name: 'Wukong', image: { full: 'MonkeyKing.png' } },
    },
  },
  [`${CDN}/cdn/16.19.1/data/en_US/item.json`]: {
    data: {
      '3047': { name: 'Plated Steelcaps', tags: ['Boots', 'Armor'] },
      '3142': { name: "Youmuu's Ghostblade", tags: ['Damage'] },
    },
  },
};
const fakeFetch = async (url: string) => {
  if (!(url in responses)) throw new Error(`unexpected ${url}`);
  return responses[url];
};

describe('DataDragon', () => {
  it('loads champions and items from latest version', async () => {
    const dd = new DataDragon(fakeFetch);
    await dd.load();
    expect(dd.champions().map((c) => c.name)).toEqual(['Darius', 'Wukong']);
    expect(dd.championById('darius')).toEqual({
      id: 'Darius', key: 122, name: 'Darius', icon: `${CDN}/cdn/16.19.1/img/champion/Darius.png`,
    });
    expect(dd.championByKey(62)?.id).toBe('MonkeyKing');
    expect(dd.item('3142')).toEqual({ id: '3142', name: "Youmuu's Ghostblade", icon: `${CDN}/cdn/16.19.1/img/item/3142.png` });
    expect(dd.isBoots('3047')).toBe(true);
    expect(dd.isBoots('3142')).toBe(false);
  });

  it('returns undefined for unknown ids', async () => {
    const dd = new DataDragon(fakeFetch);
    await dd.load();
    expect(dd.championById('zzz')).toBeUndefined();
    expect(dd.championByKey(9999)).toBeUndefined();
    expect(dd.item('1')).toBeUndefined();
  });
});
