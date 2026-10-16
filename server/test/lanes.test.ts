import { describe, it, expect } from 'vitest';
import { guessLanes, SMITE } from '../src/live/lanes';

const p = (id: string, smite = false) => ({ champion: { id }, spells: smite ? [4, SMITE] : [4, 14] });
const main = { Darius: 'top', Ahri: 'middle', Jinx: 'bottom', Lulu: 'support', LeeSin: 'jungle' } as const;

describe('guessLanes', () => {
  it('gives Smite jungle and the rest their main lanes', () => {
    const team = [p('Lulu'), p('Ahri', true), p('Jinx'), p('Darius'), p('Garen')];
    expect(guessLanes(team, main)).toEqual(['support', 'jungle', 'bottom', 'top', 'middle']);
  });

  it('puts the Smite holder in jungle even off their main lane', () => {
    const team = [p('Darius'), p('Ahri', true), p('Jinx'), p('Lulu'), p('LeeSin')];
    expect(guessLanes(team, main)).toEqual(['top', 'jungle', 'bottom', 'support', 'middle']);
  });

  it('keeps Riot order on ties', () => {
    const team = [p('A'), p('B'), p('C'), p('D'), p('E')];
    expect(guessLanes(team, {})).toEqual(['top', 'jungle', 'middle', 'bottom', 'support']);
  });

  it('guesses all five lanes without Smite', () => {
    const team = [p('LeeSin'), p('Lulu'), p('Ahri'), p('Jinx'), p('Darius')];
    expect(guessLanes(team, main)).toEqual(['jungle', 'support', 'middle', 'bottom', 'top']);
  });

  it('only the first Smite holder is jungle', () => {
    const team = [p('A', true), p('B', true), p('C'), p('D'), p('E')];
    expect(guessLanes(team, {})).toEqual(['jungle', 'top', 'middle', 'bottom', 'support']);
  });

  it('returns nulls when the team is not 5 players', () => {
    expect(guessLanes([p('A'), p('B')], main)).toEqual([null, null]);
  });
});
