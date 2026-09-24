import type { TierListResponse } from '@lol/shared';
import { CounterList } from './CounterList';

const EMPTY = 'No champions with enough games';

export function TierList({ data, onOpen }: { data: TierListResponse; onOpen(id: string): void }) {
  return (
    <div className="results">
      <section className="best">
        <h2>Best win rates — {data.lane}</h2>
        <CounterList counters={data.best} onOpen={onOpen} empty={EMPTY} />
      </section>
      <section className="worst">
        <h2>Lowest win rates — {data.lane}</h2>
        <CounterList counters={data.worst} onOpen={onOpen} empty={EMPTY} />
      </section>
    </div>
  );
}
