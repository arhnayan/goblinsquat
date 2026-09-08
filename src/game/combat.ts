import type { Rng } from "./rng";
import type { Monster } from "./generate";

export function rollDamage(rng: Rng, atk: number, def: number): number {
  return Math.max(1, atk - def + rng.int(3));
}

export function killDrop(rng: Rng, monster: Monster): "gold" | "potion" | null {
  if (monster.hp > 0) return null;
  if (rng.chance(0.08)) return "potion";
  if (rng.chance(0.22)) return "gold";
  return null;
}
