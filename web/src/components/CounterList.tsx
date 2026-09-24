import type { TierEntry } from '@lol/shared';

interface Props { counters: TierEntry[]; onOpen(id: string): void; empty?: string }

export function CounterList({ counters, onOpen, empty = 'No counters with enough games' }: Props) {
  if (counters.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ol className="counters">
      {counters.map(({ champion, winRate, games }) => (
        <li key={champion.id} className="counter-row">
          <div className="counter">
            <img src={champion.icon} alt="" width={40} height={40} />
            <span className="name">{champion.name}</span>
            <span className="wr">{winRate.toFixed(2)}% WR</span>
            <span className="muted">{games.toLocaleString('en-GB')} games</span>
          </div>
          <button className="open" aria-label={`Open ${champion.name} page`} title={`Open ${champion.name} page`} onClick={() => onOpen(champion.id)}>
            ↗
          </button>
        </li>
      ))}
    </ol>
  );
}
