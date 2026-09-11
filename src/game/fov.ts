import { cellKey, type Dungeon, isOpaque } from "./dungeon";

export function computeFov(
  dungeon: Dungeon,
  ox: number,
  oz: number,
  radius: number,
): Set<string> {
  const visible = new Set<string>();
  for (let z = oz - radius; z <= oz + radius; z++) {
    for (let x = ox - radius; x <= ox + radius; x++) {
      const dist = Math.max(Math.abs(x - ox), Math.abs(z - oz));
      if (dist > radius) continue;
      if (x < 0 || z < 0 || x >= dungeon.width || z >= dungeon.height) continue;
      if (hasLos(dungeon, ox, oz, x, z)) visible.add(cellKey(x, z));
    }
  }
  return visible;
}

export function markSeen(
  seen: boolean[][],
  visible: Set<string>,
  width: number,
  height: number,
): void {
  for (const k of visible) {
    const [xs, zs] = k.split(",");
    const x = Number(xs);
    const z = Number(zs);
    if (x >= 0 && z >= 0 && x < width && z < height) seen[z][x] = true;
  }
}

export type RayCast = {
  /** grid cells crossed after the origin, in travel order, deduped */
  cells: { x: number; z: number }[];
  /** fractional grid-space point the ray stopped at (for a smooth visual endpoint) */
  endX: number;
  endZ: number;
  /** true if a wall stopped the ray short of maxDist */
  blocked: boolean;
};

/**
 * Walks a ray from (x0,z0) at `angle` radians for up to `maxDist` grid units,
 * in small fractional steps (unlike hasLos, which only supports point-to-point
 * 8-way-agnostic checks). Stops at the first opaque cell. Each integer (x,z)
 * is treated as the center of a unit cell, matching how actors/worldPos treat
 * grid coordinates elsewhere.
 */
export function raycastCells(
  dungeon: Dungeon,
  x0: number,
  z0: number,
  angle: number,
  maxDist: number,
  step = 0.12,
): RayCast {
  const dx = Math.cos(angle) * step;
  const dz = Math.sin(angle) * step;
  const cells: { x: number; z: number }[] = [];
  const seen = new Set<string>();
  let x = x0;
  let z = z0;
  let endX = x0;
  let endZ = z0;
  let blocked = false;
  const steps = Math.max(1, Math.round(maxDist / step));
  for (let i = 1; i <= steps; i++) {
    x += dx;
    z += dz;
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (cx === x0 && cz === z0) {
      endX = x;
      endZ = z;
      continue;
    }
    if (isOpaque(dungeon, cx, cz)) {
      blocked = true;
      endX = x - dx;
      endZ = z - dz;
      break;
    }
    endX = x;
    endZ = z;
    const key = cellKey(cx, cz);
    if (!seen.has(key)) {
      seen.add(key);
      cells.push({ x: cx, z: cz });
    }
  }
  return { cells, endX, endZ, blocked };
}

export function hasLos(
  dungeon: Dungeon,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  let x = x0;
  let z = z0;
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;
  while (x !== x1 || z !== z1) {
    if (!(x === x0 && z === z0) && isOpaque(dungeon, x, z)) return false;
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      z += sz;
    }
  }
  return true;
}
