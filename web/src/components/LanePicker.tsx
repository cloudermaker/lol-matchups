import { LANES, type Lane } from '@lol/shared';

export function LanePicker({ value, onChange }: { value: Lane; onChange(l: Lane): void }) {
  return (
    <div className="lanes" role="group" aria-label="Lane">
      {LANES.map((l) => (
        <button key={l} aria-pressed={l === value} onClick={() => onChange(l)}>{l}</button>
      ))}
    </div>
  );
}
