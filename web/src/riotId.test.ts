import { parseRiotId } from './riotId';

describe('parseRiotId', () => {
  it('splits name and tag', () => {
    expect(parseRiotId(' Mr Noodle#EUW ')).toEqual({ gameName: 'Mr Noodle', tagLine: 'EUW' });
  });
  it('rejects text without a name or tag', () => {
    expect(parseRiotId('Darius')).toBeNull();
    expect(parseRiotId('Name#')).toBeNull();
    expect(parseRiotId('#EUW')).toBeNull();
  });
});
