import type { Champion, Item } from '@lol/shared';
import type { FetchJson } from './http';

const CDN = 'https://ddragon.leagueoflegends.com';

interface RawChampion { id: string; key: string; name: string; image: { full: string } }
interface RawItem { name: string; tags?: string[] }

export class DataDragon {
  private byId = new Map<string, Champion>();
  private byKey = new Map<number, Champion>();
  private items = new Map<string, Item>();
  private boots = new Set<string>();

  constructor(private fetchJson: FetchJson) {}

  async load(): Promise<void> {
    const [version] = (await this.fetchJson(`${CDN}/api/versions.json`)) as string[];
    const base = `${CDN}/cdn/${version}`;
    const champs = (await this.fetchJson(`${base}/data/en_US/champion.json`)) as { data: Record<string, RawChampion> };
    const items = (await this.fetchJson(`${base}/data/en_US/item.json`)) as { data: Record<string, RawItem> };

    for (const c of Object.values(champs.data)) {
      const champ: Champion = { id: c.id, key: Number(c.key), name: c.name, icon: `${base}/img/champion/${c.image.full}` };
      this.byId.set(c.id.toLowerCase(), champ);
      this.byKey.set(champ.key, champ);
    }
    for (const [id, i] of Object.entries(items.data)) {
      this.items.set(id, { id, name: i.name, icon: `${base}/img/item/${id}.png` });
      if (i.tags?.includes('Boots')) this.boots.add(id);
    }
  }

  champions(): Champion[] {
    return [...this.byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  championById(id: string) { return this.byId.get(id.toLowerCase()); }
  championByKey(key: number) { return this.byKey.get(key); }
  item(id: string) { return this.items.get(id); }
  isBoots(id: string) { return this.boots.has(id); }
}
