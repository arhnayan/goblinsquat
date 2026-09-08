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
