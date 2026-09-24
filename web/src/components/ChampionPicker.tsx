import { useEffect, useState } from 'react';
import type { Champion } from '@lol/shared';

interface Props { champions: Champion[]; value: string | null; onChange(id: string | null): void }

export function ChampionPicker({ champions, value, onChange }: Props) {
  const [text, setText] = useState('');

  // show the current champion's name when the page changes
  useEffect(() => {
    const current = champions.find((c) => c.id.toLowerCase() === value?.toLowerCase());
    if (current) setText(current.name);
  }, [value, champions]);

  return (
    <>
      <input
        list="champions"
        placeholder="Champion…"
        aria-label="Champion"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const name = e.target.value.toLowerCase();
          onChange(champions.find((c) => c.name.toLowerCase() === name)?.id ?? null);
        }}
      />
      <datalist id="champions">{champions.map((c) => <option key={c.id} value={c.name} />)}</datalist>
    </>
  );
}
