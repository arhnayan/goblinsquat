import { getBalance, makeFood, type Item } from "./catalog";
import { rollLootArmor, rollLootWeapon, rollPotion } from "./loot";
import type { Rng } from "./rng";

export type ShopOffer = {
  item: Item;
  price: number;
};

export type ShopState = {
  offers: ShopOffer[];
};

export function catalogPrice(item: Item): number {
  if (item.price && item.price > 0) return item.price;
  if (item.kind === "potion") return 12;
  if (item.kind === "food") return 6;
  if (item.kind === "weapon") return (item.weaponAtk ?? 3) * 8;
  if (item.kind === "armor") return (item.armorDef ?? 1) * 14;
  return 0;
}

export function scaledPrice(base: number, depth: number): number {
  return Math.max(1, Math.round(base * (1 + depth * getBalance().shopDepthPriceSlope)));
}

export function sellPrice(item: Item): number {
  const value = catalogPrice(item);
  if (value <= 0) return 0;
  return Math.max(1, Math.floor(value * getBalance().shopSellMul));
}

export function generateShopOffers(rng: Rng, depth: number): ShopState {
  const offers: ShopOffer[] = [];
  const b = getBalance();
  const n = rng.range(b.shopOfferMin, b.shopOfferMax);
  const kinds: Array<"potion" | "food" | "weapon" | "armor"> = [
    "potion",
    "food",
    "weapon",
    "armor",
  ];
  for (let i = 0; i < n; i++) {
    const kind = i < 2 ? kinds[i]! : rng.pick(kinds);
    offers.push(makeOffer(rng, depth, kind));
  }
  if (offers.length) {
    const sale = rng.pick(offers);
    sale.price = Math.max(1, Math.round(sale.price * b.shopSaleMul));
  }
  return { offers };
}

function makeOffer(
  rng: Rng,
  depth: number,
  kind: "potion" | "food" | "weapon" | "armor",
): ShopOffer {
  if (kind === "potion") {
    const item = rollPotion(depth, rng, -1, -1);
    return { item, price: scaledPrice(catalogPrice(item), depth) };
  }
  if (kind === "food") {
    const item = makeFood(-1, -1);
    return { item, price: scaledPrice(catalogPrice(item), depth) };
  }
  if (kind === "weapon") {
    const item = rollLootWeapon(depth, rng, -1, -1);
    return { item, price: scaledPrice(catalogPrice(item), depth) };
  }
  const item = rollLootArmor(depth, rng, -1, -1);
  return { item, price: scaledPrice(catalogPrice(item), depth) };
}

export function canSell(item: Item): boolean {
  return item.kind === "potion" || item.kind === "food" || item.kind === "weapon" || item.kind === "armor";
}
