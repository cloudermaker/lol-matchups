import { addRecent, readRecent } from './recentPlayers';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('recent players', () => {
  it('is empty by default', () => {
    expect(readRecent()).toEqual([]);
  });

  it('keeps the newest first, without case duplicates', () => {
    addRecent('A#EUW');
    addRecent('B#EUW');
    expect(addRecent('a#euw')).toEqual(['a#euw', 'B#EUW']);
    expect(readRecent()).toEqual(['a#euw', 'B#EUW']);
  });

  it('keeps at most 5', () => {
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((n) => addRecent(`${n}#EUW`));
    expect(readRecent()).toEqual(['F#EUW', 'E#EUW', 'D#EUW', 'C#EUW', 'B#EUW']);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('recentPlayers', '{bad');
    expect(readRecent()).toEqual([]);
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readRecent()).toEqual([]);
    expect(addRecent('A#EUW')).toEqual(['A#EUW']);
  });
});
