import { render, screen, fireEvent } from '@testing-library/react';
import type { TierListResponse } from '@lol/shared';
import { TierList } from './TierList';

const data: TierListResponse = {
  lane: 'top', tier: 'platinum_plus',
  best: [{ champion: { id: 'Zilean', key: 26, name: 'Zilean', icon: 'z.png' }, winRate: 55.03, games: 7921 }],
  worst: [{ champion: { id: 'Nilah', key: 895, name: 'Nilah', icon: 'n.png' }, winRate: 40.61, games: 1182 }],
};

describe('TierList', () => {
  it('lists best and lowest win rates', () => {
    render(<TierList data={data} onOpen={() => {}} />);
    expect(screen.getByText('Best win rates — top')).toBeInTheDocument();
    expect(screen.getByText('Zilean')).toBeInTheDocument();
    expect(screen.getByText('55.03% WR')).toBeInTheDocument();
    expect(screen.getByText('7,921 games')).toBeInTheDocument();
    expect(screen.getByText('Lowest win rates — top')).toBeInTheDocument();
    expect(screen.getByText('Nilah')).toBeInTheDocument();
  });

  it('opens a champion with its button', () => {
    const onOpen = vi.fn();
    render(<TierList data={data} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Nilah page' }));
    expect(onOpen).toHaveBeenCalledWith('Nilah');
  });

  it('shows an empty state', () => {
    render(<TierList data={{ lane: 'top', tier: 'platinum_plus', best: [], worst: [] }} onOpen={() => {}} />);
    expect(screen.getAllByText('No champions with enough games')).toHaveLength(2);
  });
});
