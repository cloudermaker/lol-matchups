import type { Counter } from '@lol/shared';

interface Props { counters: Counter[]; selected: string | null; onSelect(id: string): void; onOpen(id: string): void }

export function CounterList({ counters, selected, onSelect, onOpen }: Props) {
  if (counters.length === 0) return <p className="muted">No counters with enough games</p>;
  return (
    <ol className="counters">
      {counters.map(({ champion, winRate, games }) => (
        <li key={champion.id} className="counter-row">
          <button
            className={selected === champion.id ? 'counter active' : 'counter'}
            aria-pressed={selected === champion.id}
            onClick={() => onSelect(champion.id)}
          >
            <img src={champion.icon} alt="" width={40} height={40} />
            <span className="name">{champion.name}</span>
            <span className="wr">{winRate.toFixed(2)}% WR</span>
            <span className="muted">{games.toLocaleString('en-GB')} games</span>
          </button>
          <button className="open" aria-label={`Open ${champion.name} page`} title={`Open ${champion.name} page`} onClick={() => onOpen(champion.id)}>
            ↗
          </button>
        </li>
      ))}
    </ol>
  );
}
