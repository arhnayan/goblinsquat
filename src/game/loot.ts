import type { Rng } from "./rng";
import {
  getBalance,
  makeArmor,
  makePotion,
  makeWeapon,
  pickArmor,
  pickWeapon,
  potionHeal,
  type AffixDef,
  type Item,
  type ItemRarity,
  type PotionKind,
} from "./catalog";

export const RARITY_ORDER: ItemRarity[] = ["common", "fine", "mastercraft"];

function rarityMul(rarity: ItemRarity): number {
  const b = getBalance();
  if (rarity === "common") return b.rarityCommonPriceMul;
  return rarity === "fine" ? b.rarityFine.priceMul : b.rarityMastercraft.priceMul;
}

function raritySlots(rarity: ItemRarity): number {
  const b = getBalance();
  if (rarity === "common") return b.rarityCommonAffixSlots;
  return rarity === "fine" ? b.rarityFine.affixSlots : b.rarityMastercraft.affixSlots;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rarityWeights(depth: number): Record<ItemRarity, number> {
  const b = getBalance();
  const fine = clamp(
    b.rarityFine.weightBase + depth * b.rarityFine.weightSlope,
    b.rarityFine.weightMin,
    b.rarityFine.weightMax,
  );
  const mastercraft = clamp(
    b.rarityMastercraft.weightBase + depth * b.rarityMastercraft.weightSlope,
    b.rarityMastercraft.weightMin,
    b.rarityMastercraft.weightMax,
  );
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

function pickAffixes(pool: AffixDef[], n: number, rng: Rng): AffixDef[] {
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

export function composeItemName(base: string, rarity: ItemRarity, affixes: AffixDef[]): string {
  const prefix = rarity === "common" ? "" : `${rarity} `;
  const words = affixes.map((a) => a.label).join(" ");
  return `${prefix}${words ? words + " " : ""}${base}`;
}

function applyRarity(item: Item, depth: number, rng: Rng, minRarity?: ItemRarity): Item {
  const rarity = rollRarity(depth, rng, minRarity ?? "common");
  const b = getBalance();
  const pool = item.kind === "weapon" ? b.weaponAffixes : b.armorAffixes;
  const chosen = pickAffixes(pool, raritySlots(rarity), rng);
  for (const a of chosen) {
    if (item.kind === "weapon") item.weaponAtk = (item.weaponAtk ?? 0) + (a.atkBonus ?? 0);
    else item.armorDef = (item.armorDef ?? 0) + (a.defBonus ?? 0);
  }
  item.rarity = rarity;
  item.affixIds = chosen.map((a) => a.id);
  item.price = Math.round((item.price ?? 0) * rarityMul(rarity));
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

function potionWeights(depth: number): Record<PotionKind, number> {
  const b = getBalance();
  const antidote = clamp(
    b.potionAntidoteBase + depth * b.potionAntidoteSlope,
    b.potionAntidoteMin,
    b.potionAntidoteMax,
  );
  const vigor = clamp(
    b.potionVigorBase + depth * b.potionVigorSlope,
    b.potionVigorMin,
    b.potionVigorMax,
  );
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
  const b = getBalance();
  return Math.min(b.eliteChanceCap, Math.max(0, (depth - b.eliteDepthOffset) * b.eliteChanceSlope));
}

export function hasAffix(affixIds: string[] | undefined, id: string): boolean {
  return !!affixIds && affixIds.includes(id);
}
