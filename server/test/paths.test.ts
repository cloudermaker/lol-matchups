import { describe, it, expect } from 'vitest';
import { matchDir } from '../src/paths';

describe('matchDir', () => {
  it('uses server/data/matches locally', () => {
    expect(matchDir({}, '/repo/server/data/matches')).toBe('/repo/server/data/matches');
  });

  it('uses /tmp on Vercel, where the disk is read-only', () => {
    expect(matchDir({ VERCEL: '1' }, '/repo/server/data/matches')).toBe('/tmp/matches');
  });

  it('lets MATCH_DIR win', () => {
    expect(matchDir({ VERCEL: '1', MATCH_DIR: '/data/m' }, '/x')).toBe('/data/m');
  });
});
