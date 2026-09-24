import { render, screen, fireEvent } from '@testing-library/react';
import type { ProfileResponse, StatLine } from '@lol/shared';
import { PlayerPage, compare } from './PlayerPage';

const champ = (id: string) => ({ id, key: id.length, name: id, icon: `${id}.png` });
const you: StatLine = { csPerMin: 7, deaths: 6, visionPerMin: 1, damagePerMin: 500, goldPerMin: 400 };
const opp: StatLine = { csPerMin: 6, deaths: 4, visionPerMin: 1, damagePerMin: 500, goldPerMin: 400 };
const profile: ProfileResponse = {
  riotId: 'Me#EUW', rank: { tier: 'GOLD', division: 'I', lp: 12 }, tier: 'gold_plus',
  games: 10, winRate: 60, mainLane: 'top', lolalyticsAvailable: true,
  pool: [
    { champion: champ('Darius'), lane: 'top', games: 8, wins: 5, winRate: 63, kda: 2.5, you, opponents: opp },
    { champion: champ('Garen'), lane: 'top', games: 2, wins: 1, winRate: 50, kda: 1, you: null, opponents: null },
  ],
  advice: [{ kind: 'best', text: 'Best pick: Darius — 63% over 8 games' }],
};

describe('compare', () => {
  it('uses a 10% threshold', () => {
    expect(compare(7, 6)).toBe('better');
    expect(compare(6.5, 6)).toBe('even');
    expect(compare(5, 6)).toBe('worse');
  });
  it('treats fewer deaths as better', () => {
    expect(compare(3, 4, true)).toBe('better');
    expect(compare(6, 4, true)).toBe('worse');
  });
  it('is even against zero', () => {
    expect(compare(2, 0)).toBe('even');
  });
});

describe('PlayerPage', () => {
  it('shows the header and advice', () => {
    render(<PlayerPage data={profile} onOpen={() => {}} />);
    expect(screen.getByText('Me#EUW')).toBeInTheDocument();
    expect(screen.getByText('GOLD I · 12 LP · 10 ranked games analysed · 60% WR · main top')).toBeInTheDocument();
    expect(screen.getByText('Best pick: Darius — 63% over 8 games')).toBeInTheDocument();
  });

  it('colours benchmarks and greys out rows with few games', () => {
    render(<PlayerPage data={profile} onOpen={() => {}} />);
    expect(screen.getByText('7.0 / 6.0')).toHaveClass('better');
    expect(screen.getByText('6.0 / 4.0')).toHaveClass('worse');
    expect(screen.getByText('too few games').closest('tr')).toHaveClass('few');
  });

  it('opens a champion page', () => {
    const onOpen = vi.fn();
    render(<PlayerPage data={profile} onOpen={onOpen} />);
    fireEvent.click(screen.getByLabelText('Open Darius page'));
    expect(onOpen).toHaveBeenCalledWith('Darius', 'top');
  });

  it('says when there are no ranked games', () => {
    render(<PlayerPage data={{ ...profile, rank: null, games: 0, pool: [], advice: [] }} onOpen={() => {}} />);
    expect(screen.getByText('No ranked Solo/Duo games found for Me#EUW.')).toBeInTheDocument();
    expect(screen.getByText('Not your account? Check the tag after # — your full Riot ID is shown in the League client.')).toBeInTheDocument();
    expect(screen.getByText('Unranked · 0 ranked games analysed · main top')).toBeInTheDocument();
  });

  it('notes when lolalytics is unavailable', () => {
    render(<PlayerPage data={{ ...profile, lolalyticsAvailable: false }} onOpen={() => {}} />);
    expect(screen.getByText('lolalytics unavailable: counter tags and build advice skipped')).toBeInTheDocument();
  });
});
