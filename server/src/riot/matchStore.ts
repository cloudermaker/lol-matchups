import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RiotMatch } from './types';

const MATCH_ID = /^[A-Z0-9]+_\d+$/;

// finished matches never change, so they are kept forever
export class MatchStore {
  constructor(private dir: string, private fetchMatch: (id: string) => Promise<RiotMatch>) {}

  async get(id: string): Promise<RiotMatch> {
    if (!MATCH_ID.test(id)) throw new Error(`Invalid match id: ${id}`);
    const file = join(this.dir, `${id}.json`);
    const cached = await this.read(file);
    if (cached) return cached;
    const match = await this.fetchMatch(id);
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, JSON.stringify(match));
    return match;
  }

  private async read(file: string): Promise<RiotMatch | null> {
    let text: string;
    try { text = await readFile(file, 'utf8'); } catch { return null; }
    try { return JSON.parse(text) as RiotMatch; } catch { await rm(file, { force: true }); return null; }
  }
}
