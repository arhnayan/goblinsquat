import type { Rng } from "./rng";
import {
  makeArmor,
  makePotion,
  makeTrinket,
  makeWeapon,
  pickArmor,
  pickTrinket,
  pickWeapon,
  potionHeal,
  type Item,
  type ItemRarity,
  type PotionKind,
} from "./catalog";

export const RARITY_ORDER: ItemRarity[] = ["common", "fine", "mastercraft"];

const RARITY_SLOTS: Record<ItemRarity, number> = {
  common: 0,
  fine: 1,
  mastercraft: 2,
};

const RARITY_PRICE_MUL: Record<ItemRarity, number> = {
  common: 1,
  fine: 1.5,
  mastercraft: 2.4,
};

type Affix = {
  id: string;
  label: string;
  atkBonus?: number;
  defBonus?: number;
  proc?: "lifesteal" | "keen" | "thorns" | "wardStatus";
};

export const WEAPON_AFFIXES: Affix[] = [
  { id: "heavy", label: "heavy", atkBonus: 1 },
  { id: "vampiric", label: "vampiric", proc: "lifesteal" },
  { id: "keen", label: "keen", proc: "keen" },
];

export const ARMOR_AFFIXES: Affix[] = [
  { id: "sturdy", label: "sturdy", defBonus: 1 },
  { id: "thorned", label: "thorned", proc: "thorns" },
  { id: "warded", label: "warded", proc: "wardStatus" },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rarityWeights(depth: number): Record<ItemRarity, number> {
  const fine = clamp(14 + depth * 3, 14, 46);
  const mastercraft = clamp(2 + depth * 2, 2, 22);
  const common = Math.max(10, 100 - fine - mastercraft);
  return { common, fine, mastercraft };
}

export function rollRarity(depth: number, rng: Rng, minRarity: ItemRarity = "common"): ItemRarity {
  const weights = rarityWeights(depth);
  const minIndex = RARITY_ORDER.indexOf(minRarity);
  const pool = RARITY_ORDER.filter((_, i) => i >= minIndex);
  const total = pool.reduce((sum, r) => sum + weights[r], 0);
  if (total <= 0) return pool[pool.length - 1]!;
  let n = rng.next() * total;
  for (const r of pool) {
    n -= weights[r];
    if (n <= 0) return r;
  }
  return pool[pool.length - 1]!;
}

function pickAffixes(pool: Affix[], n: number, rng: Rng): Affix[] {
  if (n <= 0) return [];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

export function composeItemName(base: string, rarity: ItemRarity, affixes: Affix[]): string {
  const prefix = rarity === "common" ? "" : `${rarity} `;
  const words = affixes.map((a) => a.label).join(" ");
  return `${prefix}${words ? words + " " : ""}${base}`;
}

function applyRarity(item: Item, depth: number, rng: Rng, minRarity?: ItemRarity): Item {
  const rarity = rollRarity(depth, rng, minRarity ?? "common");
  const pool = item.kind === "weapon" ? WEAPON_AFFIXES : ARMOR_AFFIXES;
  const chosen = pickAffixes(pool, RARITY_SLOTS[rarity], rng);
  for (const a of chosen) {
    if (item.kind === "weapon") item.weaponAtk = (item.weaponAtk ?? 0) + (a.atkBonus ?? 0);
    else item.armorDef = (item.armorDef ?? 0) + (a.defBonus ?? 0);
  }
  item.rarity = rarity;
  item.affixIds = chosen.map((a) => a.id);
  item.price = Math.round((item.price ?? 0) * RARITY_PRICE_MUL[rarity]);
  item.name = composeItemName(item.name, rarity, chosen);
  return item;
}

export function rollLootWeapon(
  depth: number,
  rng: Rng,
  x: number,
  z: number,
  minRarity?: ItemRarity,
): Item {
  const item = makeWeapon(x, z, pickWeapon(depth, rng));
  return applyRarity(item, depth, rng, minRarity);
}

export function rollLootArmor(
  depth: number,
  rng: Rng,
  x: number,
  z: number,
  minRarity?: ItemRarity,
): Item {
  const item = makeArmor(x, z, pickArmor(depth, rng));
  return applyRarity(item, depth, rng, minRarity);
}

export function rollLootTrinket(
  depth: number,
  rng: Rng,
  x: number,
  z: number,
  minRarity?: ItemRarity,
): Item {
  const item = makeTrinket(x, z, pickTrinket(depth, rng));
  const rarity = rollRarity(depth, rng, minRarity ?? "common");
  const rarityIndex = RARITY_ORDER.indexOf(rarity);
  item.rarity = rarity;
  item.trinketMagnitude = (item.trinketMagnitude ?? 0) * (1 + 0.15 * rarityIndex);
  item.price = Math.round((item.price ?? 0) * RARITY_PRICE_MUL[rarity]);
  item.name = composeItemName(item.name, rarity, []);
  return item;
}

function potionWeights(depth: number): Record<PotionKind, number> {
  const antidote = clamp(8 + depth * 1.5, 8, 22);
  const vigor = clamp(2 + depth * 1.5, 2, 18);
  const heal = Math.max(10, 100 - antidote - vigor);
  return { heal, antidote, vigor };
}

export function rollPotion(depth: number, rng: Rng, x: number, z: number): Item {
  const weights = potionWeights(depth);
  const total = weights.heal + weights.antidote + weights.vigor;
  let n = rng.next() * total;
  let kind: PotionKind = "heal";
  for (const k of ["heal", "antidote", "vigor"] as PotionKind[]) {
    n -= weights[k];
    if (n <= 0) {
      kind = k;
      break;
    }
  }
  const item = makePotion(x, z);
  item.potionKind = kind;
  if (kind === "antidote") {
    item.name = "antidote";
    item.price = Math.max(1, Math.round(potionHeal() * 0.6));
  } else if (kind === "vigor") {
    item.name = "vigor draught";
    item.price = Math.round(potionHeal() * 1.8) + 10;
  }
  return item;
}

export function eliteChance(depth: number): number {
  return Math.min(0.25, Math.max(0, (depth - 2) * 0.035));
}

export function hasAffix(affixIds: string[] | undefined, id: string): boolean {
  return !!affixIds && affixIds.includes(id);
}
