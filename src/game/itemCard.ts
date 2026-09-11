import { ARMOR_AFFIXES, WEAPON_AFFIXES } from "./loot";
import type { Item, ItemKind } from "./catalog";

export type ItemCardSize = "grid" | "slot" | "mini";

export type ItemCardOpts = {
  letter?: string;
  name?: string;
  price?: string;
  equipped?: boolean;
  selected?: boolean;
  size?: ItemCardSize;
  onClick?: (e: MouseEvent) => void;
};

export function kindColorVar(kind: ItemKind): string {
  switch (kind) {
    case "potion":
      return "var(--c-potion)";
    case "weapon":
      return "var(--c-weapon)";
    case "armor":
      return "var(--c-armor)";
    case "food":
      return "var(--c-food)";
    case "amulet":
      return "var(--c-amulet)";
    case "gold":
    default:
      return "var(--gold)";
  }
}

function affixProcDetail(proc: string | undefined): string {
  switch (proc) {
    case "lifesteal":
      return "lifesteal on hit";
    case "keen":
      return "extra crit chance";
    case "thorns":
      return "reflects damage";
    case "wardStatus":
      return "resists status";
    default:
      return "";
  }
}

export function affixDisplay(item: Item): { label: string; detail: string }[] {
  const ids = item.affixIds;
  if (!ids || !ids.length) return [];
  const pool = item.kind === "weapon" ? WEAPON_AFFIXES : item.kind === "armor" ? ARMOR_AFFIXES : [];
  const out: { label: string; detail: string }[] = [];
  for (const id of ids) {
    const a = pool.find((x) => x.id === id);
    if (!a) continue;
    const detail = a.atkBonus
      ? `+${a.atkBonus} atk`
      : a.defBonus
        ? `+${a.defBonus} def`
        : affixProcDetail(a.proc);
    out.push({ label: a.label, detail });
  }
  return out;
}

export function buildItemCard(item: Item | null, opts: ItemCardOpts = {}): HTMLElement {
  const size = opts.size ?? "grid";
  const card = document.createElement("div");
  card.className = `item-card size-${size}`;
  if (item) {
    card.classList.add(`kind-${item.kind}`, `rarity-${item.rarity ?? "common"}`);
  } else {
    card.classList.add("is-empty");
  }
  if (opts.equipped) card.classList.add("is-equipped");
  if (opts.selected) card.classList.add("is-selected");

  if (opts.letter) {
    const key = document.createElement("kbd");
    key.className = "item-card-key";
    key.textContent = opts.letter;
    card.append(key);
  }

  const glyph = document.createElement("i");
  glyph.className = "item-card-glyph";
  glyph.textContent = item ? item.glyph : "";
  glyph.style.color = item ? kindColorVar(item.kind) : "";
  card.append(glyph);

  const name = document.createElement("span");
  name.className = "item-card-name";
  name.textContent = opts.name ?? item?.name ?? "";
  card.append(name);

  if (opts.price) {
    const price = document.createElement("span");
    price.className = "item-card-price";
    price.textContent = opts.price;
    card.append(price);
  }

  if (opts.equipped) {
    const badge = document.createElement("i");
    badge.className = "item-card-badge";
    badge.textContent = "✓";
    card.append(badge);
  }

  if (opts.onClick) card.addEventListener("click", opts.onClick);

  return card;
}

export function buildEmptySlotCard(kind: "weapon" | "armor"): HTMLElement {
  const card = document.createElement("div");
  card.className = "item-card size-slot is-empty";
  const glyph = document.createElement("i");
  glyph.className = "item-card-glyph";
  glyph.textContent = kind === "weapon" ? ")" : "]";
  glyph.style.color = kindColorVar(kind);
  card.append(glyph);
  const name = document.createElement("span");
  name.className = "item-card-name";
  name.textContent = kind === "weapon" ? "no weapon" : "no armor";
  card.append(name);
  return card;
}
