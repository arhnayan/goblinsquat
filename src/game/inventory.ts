import {
  aAn,
  foodHeal,
  PACK_SIZE,
  potionHeal,
  TRINKET_EFFECT_DEFAULTS,
  UNARMED_ATK,
  type Item,
  type ItemKind,
  type TrinketEffectKind,
} from "./catalog";
import type { Run } from "./run";
import { clearStatuses, hasAnyStatus } from "./status";

export function syncStats(run: Run): void {
  const w = run.pack.find((i) => i.id === run.weaponId);
  run.atk = w?.weaponAtk ?? UNARMED_ATK;
  const a = run.pack.find((i) => i.id === run.armorId);
  run.def = a?.armorDef ?? 0;
}

export function equippedAffixes(run: Run, slot: "weapon" | "armor"): string[] {
  const id = slot === "weapon" ? run.weaponId : run.armorId;
  const item = run.pack.find((i) => i.id === id);
  return item?.affixIds ?? [];
}

export function equippedTrinket(run: Run): Item | null {
  return run.pack.find((i) => i.id === run.trinketId) ?? null;
}

export function hasTrinketEffect(run: Run, effect: TrinketEffectKind): boolean {
  return equippedTrinket(run)?.trinketEffect === effect;
}

export function trinketMagnitude(run: Run, effect: TrinketEffectKind): number {
  const t = equippedTrinket(run);
  if (t?.trinketEffect !== effect) return 0;
  return t.trinketMagnitude ?? TRINKET_EFFECT_DEFAULTS[effect];
}

export function packFull(run: Run): boolean {
  return run.pack.length >= PACK_SIZE;
}

export function addToPack(run: Run, item: Item): boolean {
  if (packFull(run)) return false;
  run.pack.push(item);
  return true;
}

export function countKind(run: Run, kind: ItemKind): number {
  return run.pack.filter((i) => i.kind === kind).length;
}

export function firstOfKind(run: Run, kind: ItemKind): number {
  return run.pack.findIndex((i) => i.kind === kind);
}

export function itemTag(run: Run, item: Item): string {
  if (item.id === run.weaponId) return " (wielded)";
  if (item.id === run.armorId) return " (worn)";
  if (item.id === run.trinketId) return " (bound)";
  return "";
}

function healAmount(run: Run, base: number): number {
  return Math.round(base * (1 + trinketMagnitude(run, "gourmand")));
}

export function usePackItem(run: Run, index: number): string {
  const it = run.pack[index];
  if (!it) return "nothing there";
  if (it.kind === "potion") {
    run.pack.splice(index, 1);
    const kind = it.potionKind ?? "heal";
    if (kind === "antidote") {
      const afflicted = hasAnyStatus(run);
      clearStatuses(run);
      run.hp = Math.min(run.maxHp, run.hp + healAmount(run, Math.ceil(potionHeal() / 2)));
      return afflicted ? "the antidote purges the sickness" : "the antidote does little";
    }
    if (kind === "vigor") {
      run.maxHp += 2;
      run.hp = Math.min(run.maxHp, run.hp + 2);
      return "you feel sturdier";
    }
    const afflicted = hasAnyStatus(run);
    clearStatuses(run);
    if (run.hp >= run.maxHp && !afflicted) return "the potion does nothing";
    run.hp = Math.min(run.maxHp, run.hp + healAmount(run, potionHeal()));
    if (afflicted && run.hp >= run.maxHp) return "your blood clears";
    if (afflicted) return "you feel better, and the sickness fades";
    return "you feel better";
  }
  if (it.kind === "food") {
    run.pack.splice(index, 1);
    if (run.hp >= run.maxHp) return "you are already full";
    run.hp = Math.min(run.maxHp, run.hp + healAmount(run, foodHeal()));
    return "you eat the ration";
  }
  if (it.kind === "weapon") {
    run.weaponId = it.id;
    syncStats(run);
    return `you wield the ${it.name}`;
  }
  if (it.kind === "armor") {
    run.armorId = it.id;
    syncStats(run);
    return `you put on the ${it.name}`;
  }
  if (it.kind === "trinket") {
    run.trinketId = it.id;
    return `you fasten the ${it.name}`;
  }
  return "you cannot use that";
}

export function takeFromPack(run: Run, index: number): Item | null {
  const it = run.pack[index];
  if (!it) return null;
  run.pack.splice(index, 1);
  if (run.weaponId === it.id) run.weaponId = null;
  if (run.armorId === it.id) run.armorId = null;
  if (run.trinketId === it.id) run.trinketId = null;
  syncStats(run);
  return it;
}

export function pickupMessage(item: Item): string {
  if (item.kind === "gold") return `you scoop $${item.gold ?? 0}`;
  if (item.kind === "amulet") return "the amulet hums in your hand";
  return `you pick up ${aAn(item.name)}`;
}
