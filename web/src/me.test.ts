import { readMe, saveMe } from './me';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('me', () => {
  it('is empty by default', () => {
    expect(readMe()).toBeNull();
  });

  it('saves and reads the Riot ID', () => {
    expect(saveMe('Me#EUW')).toBe('Me#EUW');
    expect(readMe()).toBe('Me#EUW');
  });

  it('ignores a value without a tag', () => {
    localStorage.setItem('me', 'garbage');
    expect(readMe()).toBeNull();
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(saveMe('Me#EUW')).toBe('Me#EUW');
    expect(readMe()).toBeNull();
  });
});
