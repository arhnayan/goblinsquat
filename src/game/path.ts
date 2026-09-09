import { charAt, cellKey, isWalkable, type Dungeon } from "./dungeon";

export type Step = { x: number; z: number };

const CARD: Step[] = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

const ALL: Step[] = [
  ...CARD,
  { x: 1, z: 1 },
  { x: 1, z: -1 },
  { x: -1, z: 1 },
  { x: -1, z: -1 },
];

export function chebyshev(ax: number, az: number, bx: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

export function isAdjacent(ax: number, az: number, bx: number, bz: number): boolean {
  const d = chebyshev(ax, az, bx, bz);
  return d === 1;
}

export type PathOpts = {
  doors: boolean;
  diagonal: boolean;
};

function passable(dungeon: Dungeon, x: number, z: number, doors: boolean): boolean {
  const ch = charAt(dungeon, x, z);
  if (ch === "+") return doors;
  return isWalkable(dungeon, x, z);
}

function noCorner(
  dungeon: Dungeon,
  x: number,
  z: number,
  dx: number,
  dz: number,
  doors: boolean,
): boolean {
  if (dx === 0 || dz === 0) return true;
  return (
    passable(dungeon, x + dx, z, doors) && passable(dungeon, x, z + dz, doors)
  );
}

export function canStep(
  dungeon: Dungeon,
  x: number,
  z: number,
  nx: number,
  nz: number,
): boolean {
  if (!isWalkable(dungeon, nx, nz)) return false;
  const dx = nx - x;
  const dz = nz - z;
  if (dx !== 0 && dz !== 0) {
    if (!isWalkable(dungeon, x + dx, z) || !isWalkable(dungeon, x, z + dz)) {
      return false;
    }
  }
  return true;
}

export function nextStepToward(
  dungeon: Dungeon,
  sx: number,
  sz: number,
  tx: number,
  tz: number,
  blocked: Set<string>,
  opts: PathOpts,
): Step | null {
  const dirs = opts.diagonal ? ALL : CARD;
  const startK = cellKey(sx, sz);
  const goalK = cellKey(tx, tz);
  if (startK === goalK) return null;

  const prev = new Map<string, string | null>();
  prev.set(startK, null);
  const q: Step[] = [{ x: sx, z: sz }];
  let qi = 0;
  let found = false;

  while (qi < q.length) {
    const cur = q[qi++]!;
    if (cur.x === tx && cur.z === tz) {
      found = true;
      break;
    }
    for (const d of dirs) {
      const nx = cur.x + d.x;
      const nz = cur.z + d.z;
      const nk = cellKey(nx, nz);
      if (prev.has(nk)) continue;
      const isGoal = nx === tx && nz === tz;
      if (!isGoal && !passable(dungeon, nx, nz, opts.doors)) continue;
      if (!isGoal && blocked.has(nk)) continue;
      if (!noCorner(dungeon, cur.x, cur.z, d.x, d.z, opts.doors)) continue;
      prev.set(nk, cellKey(cur.x, cur.z));
      q.push({ x: nx, z: nz });
    }
  }

  if (!found) return null;

  const chain: string[] = [];
  let cur: string | null = goalK;
  while (cur && cur !== startK) {
    chain.push(cur);
    cur = prev.get(cur) ?? null;
  }
  if (!cur) return null;
  chain.reverse();
  const first = chain[0];
  if (!first) return null;
  const [xs, zs] = first.split(",");
  const x = Number(xs);
  const z = Number(zs);
  if (x === tx && z === tz) return null;
  return { x, z };
}

export function nextStepAway(
  dungeon: Dungeon,
  sx: number,
  sz: number,
  tx: number,
  tz: number,
  blocked: Set<string>,
  opts: PathOpts,
): Step | null {
  const dirs = opts.diagonal ? ALL : CARD;
  let best: Step | null = null;
  let bestDist = chebyshev(sx, sz, tx, tz);
  for (const d of dirs) {
    const nx = sx + d.x;
    const nz = sz + d.z;
    if (!passable(dungeon, nx, nz, opts.doors)) continue;
    if (blocked.has(cellKey(nx, nz))) continue;
    if (!noCorner(dungeon, sx, sz, d.x, d.z, opts.doors)) continue;
    const dist = chebyshev(nx, nz, tx, tz);
    if (dist > bestDist) {
      bestDist = dist;
      best = { x: nx, z: nz };
    }
  }
  return best;
}

export function randomStep(
  dungeon: Dungeon,
  sx: number,
  sz: number,
  blocked: Set<string>,
  opts: PathOpts,
  pick: <T>(arr: readonly T[]) => T,
): Step | null {
  const dirs = opts.diagonal ? ALL : CARD;
  const optsSteps: Step[] = [];
  for (const d of dirs) {
    const nx = sx + d.x;
    const nz = sz + d.z;
    if (!passable(dungeon, nx, nz, opts.doors)) continue;
    if (blocked.has(cellKey(nx, nz))) continue;
    if (!noCorner(dungeon, sx, sz, d.x, d.z, opts.doors)) continue;
    optsSteps.push({ x: nx, z: nz });
  }
  if (!optsSteps.length) return null;
  return pick(optsSteps);
}
