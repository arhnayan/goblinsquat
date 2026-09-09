import type { Rng } from "./rng";
import { makeFood, makeGold, makePotion, type Item, type Monster } from "./catalog";

export function rollDamage(rng: Rng, atk: number, def: number): number {
  return Math.max(1, atk - def + rng.int(3));
}

export function killDrop(rng: Rng, monster: Monster): Item | null {
  if (monster.hp > 0) return null;
  if (rng.chance(0.08)) return makePotion(monster.x, monster.z);
  if (rng.chance(0.1)) return makeFood(monster.x, monster.z);
  if (rng.chance(0.22)) return makeGold(monster.x, monster.z, rng.range(2, 8));
  return null;
}
