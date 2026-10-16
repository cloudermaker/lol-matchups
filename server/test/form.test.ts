import { describe, it, expect } from 'vitest';
import { buildForm } from '../src/live/form';
import { match, participant } from './fixtures/riot';

const game = (id: string, champ: number, win: boolean, k = 1, d = 1, a = 1, duration = 1800) =>
  match(id, [participant({ puuid: 'me', championId: champ, win, kills: k, deaths: d, assists: a }), participant()], duration);

describe('buildForm', () => {
  it('counts wins, champion games and the current streak', () => {
    const f = buildForm('me', [game('1', 103, true), game('2', 103, true), game('3', 1, true), game('4', 103, false)], 103);
    expect(f).toEqual({ games: 4, wins: 3, streak: 'W3', kda: 2, champGames: 3, champWins: 2 });
  });

  it('reports a loss streak', () => {
    expect(buildForm('me', [game('1', 1, false), game('2', 1, false), game('3', 1, true)], 1).streak).toBe('L2');
  });

  it('computes KDA from totals, deaths at least 1', () => {
    expect(buildForm('me', [game('1', 1, true, 5, 0, 3)], 1).kda).toBe(8);
    expect(buildForm('me', [game('1', 1, true, 2, 3, 2), game('2', 1, true, 1, 0, 0)], 1).kda).toBe(1.67);
  });

  it('skips remakes', () => {
    const f = buildForm('me', [game('1', 1, false, 0, 0, 0, 200), game('2', 1, true)], 1);
    expect(f).toMatchObject({ games: 1, wins: 1, streak: 'W1' });
  });

  it('handles no games', () => {
    expect(buildForm('me', [], 1)).toEqual({ games: 0, wins: 0, streak: '', kda: 0, champGames: 0, champWins: 0 });
  });
});
