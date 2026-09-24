import { render, screen, fireEvent } from '@testing-library/react';
import type { Counter } from '@lol/shared';
import { CounterList } from './CounterList';

const counters: Counter[] = [
  { champion: { id: 'MonkeyKing', key: 62, name: 'Wukong', icon: 'w.png' }, winRate: 46.18, games: 2984 },
  { champion: { id: 'DrMundo', key: 36, name: 'Dr. Mundo', icon: 'm.png' }, winRate: 46.65, games: 9092 },
];

describe('CounterList', () => {
  it('shows name, win rate and games', () => {
    render(<CounterList counters={counters} onOpen={() => {}} />);
    expect(screen.getByText('Wukong')).toBeInTheDocument();
    expect(screen.getByText('46.18% WR')).toBeInTheDocument();
    expect(screen.getByText('2,984 games')).toBeInTheDocument();
  });

  it('only the open button is clickable', () => {
    const onOpen = vi.fn();
    render(<CounterList counters={counters} onOpen={onOpen} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open Dr. Mundo page' }));
    expect(onOpen).toHaveBeenCalledWith('DrMundo');
  });

  it('shows empty state', () => {
    render(<CounterList counters={[]} onOpen={() => {}} />);
    expect(screen.getByText('No counters with enough games')).toBeInTheDocument();
  });

  it('uses a custom empty message', () => {
    render(<CounterList counters={[]} onOpen={() => {}} empty="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
