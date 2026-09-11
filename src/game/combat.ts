import type { Rng } from "./rng";
import {
  DEFAULT_LOOT_TABLE,
  makeFood,
  makeGold,
  type Item,
  type Monster,
  type MonsterDef,
} from "./catalog";
import { rollLootArmor, rollLootWeapon, rollPotion } from "./loot";

export const CRIT_CHANCE = 0.18;

const ELITE_DROP_BOOST = 1.6;

export type Strike = {
  dmg: number;
  crit: boolean;
};

export function rollDamage(rng: Rng, atk: number, def: number): number {
  return Math.max(1, atk - def + rng.int(3));
}

export function rollStrike(rng: Rng, atk: number, def: number, critBonus = 0): Strike {
  const base = rollDamage(rng, atk, def);
  const crit = rng.chance(CRIT_CHANCE + critBonus);
  return { dmg: crit ? base * 2 : base, crit };
}

export function killDrop(rng: Rng, monster: Monster, depth: number, def: MonsterDef): Item | null {
  if (monster.hp > 0) return null;
  const t = def.loot ?? DEFAULT_LOOT_TABLE;
  const boost = monster.elite ? ELITE_DROP_BOOST : 1;
  const minRarity = monster.elite ? "fine" : undefined;
  if (rng.chance(Math.min(1, t.potionChance * boost))) return rollPotion(depth, rng, monster.x, monster.z);
  if (rng.chance(Math.min(1, t.foodChance * boost))) return makeFood(monster.x, monster.z);
  if (rng.chance(Math.min(1, (t.weaponChance ?? 0) * boost))) {
    return rollLootWeapon(depth, rng, monster.x, monster.z, minRarity);
  }
  if (rng.chance(Math.min(1, (t.armorChance ?? 0) * boost))) {
    return rollLootArmor(depth, rng, monster.x, monster.z, minRarity);
  }
  if (rng.chance(Math.min(1, t.goldChance * boost))) {
    return makeGold(monster.x, monster.z, rng.range(t.goldMin, t.goldMax) * (monster.elite ? 2 : 1));
  }
  return monster.elite ? makeGold(monster.x, monster.z, rng.range(4, 10)) : null;
}
