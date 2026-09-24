import { TIERS, TIER_LABELS, type Tier } from '@lol/shared';

export function TierPicker({ value, onChange }: { value: Tier; onChange(t: Tier): void }) {
  return (
    <div className="segmented" role="group" aria-label="Tier">
      {TIERS.map((t) => (
        <button key={t} aria-pressed={t === value} onClick={() => onChange(t)}>{TIER_LABELS[t]}</button>
      ))}
    </div>
  );
}
