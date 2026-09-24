import { render, screen, fireEvent } from '@testing-library/react';
import type { Counter } from '@lol/shared';
import { CounterList } from './CounterList';

const counters: Counter[] = [
  { champion: { id: 'MonkeyKing', key: 62, name: 'Wukong', icon: 'w.png' }, winRate: 46.18, games: 2984 },
  { champion: { id: 'DrMundo', key: 36, name: 'Dr. Mundo', icon: 'm.png' }, winRate: 46.65, games: 9092 },
];
const noop = () => {};

describe('CounterList', () => {
  it('shows name, win rate and games', () => {
    render(<CounterList counters={counters} selected={null} onSelect={noop} onOpen={noop} />);
    expect(screen.getByText('Wukong')).toBeInTheDocument();
    expect(screen.getByText('46.18% WR')).toBeInTheDocument();
    expect(screen.getByText('2,984 games')).toBeInTheDocument();
  });

  it('selects a counter on click without opening it', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(<CounterList counters={counters} selected={null} onSelect={onSelect} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Dr. Mundo'));
    expect(onSelect).toHaveBeenCalledWith('DrMundo');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens a counter with its own button', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(<CounterList counters={counters} selected={null} onSelect={onSelect} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Dr. Mundo page' }));
    expect(onOpen).toHaveBeenCalledWith('DrMundo');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the selected counter', () => {
    render(<CounterList counters={counters} selected="MonkeyKing" onSelect={noop} onOpen={noop} />);
    expect(screen.getByRole('button', { name: /Wukong 46.18/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows empty state', () => {
    render(<CounterList counters={[]} selected={null} onSelect={noop} onOpen={noop} />);
    expect(screen.getByText('No counters with enough games')).toBeInTheDocument();
  });
});
