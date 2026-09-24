import type { Champion } from '@lol/shared';

interface Props { champions: Champion[]; value: string; onChange(text: string): void }

export function ChampionPicker({ champions, value, onChange }: Props) {
  return (
    <>
      <input
        list="champions"
        placeholder="Champion…"
        aria-label="Champion"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="champions">{champions.map((c) => <option key={c.id} value={c.name} />)}</datalist>
    </>
  );
}

// exact name or id first, then the first name starting with the text
export function findChampion(champions: Champion[], text: string): Champion | undefined {
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  return champions.find((c) => c.name.toLowerCase() === q || c.id.toLowerCase() === q)
    ?? champions.find((c) => c.name.toLowerCase().startsWith(q));
}
