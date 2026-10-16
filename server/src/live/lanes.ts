import { LANES, type Lane, type MainLanesResponse } from '@lol/shared';

export const SMITE = 11;

export interface LaneCandidate { champion: { id: string }; spells: number[] }

// Smite holder is jungle; the rest get the permutation with the most main lanes
export function guessLanes(team: LaneCandidate[], mainLanes: MainLanesResponse): (Lane | null)[] {
  if (team.length !== LANES.length) return team.map(() => null);
  const lanes: (Lane | null)[] = team.map(() => null);
  const jungler = team.findIndex((p) => p.spells.includes(SMITE));
  if (jungler >= 0) lanes[jungler] = 'jungle';
  const rest = team.map((_, i) => i).filter((i) => i !== jungler);
  const free = LANES.filter((l) => jungler < 0 || l !== 'jungle');
  let best: Lane[] = free;
  let bestScore = -1;
  // first permutation is LANES order, so ties keep Riot order
  for (const perm of permutations(free)) {
    const score = perm.filter((lane, k) => mainLanes[team[rest[k]].champion.id] === lane).length;
    if (score > bestScore) { best = perm; bestScore = score; }
  }
  rest.forEach((i, k) => { lanes[i] = best[k]; });
  return lanes;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}
