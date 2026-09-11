import builtinJson from "./data/catalog.json";
import { getColors, isThemeColorKey, type ThemeColorKey } from "./theme";

export const PACK_SIZE = 12;
export const UNARMED_ATK = 2;
export const POISON_TURNS = 4;

export const STORAGE_KEY = "goblinsquat-catalog";

export const RESERVED_GLYPHS = new Set([
  ".",
  "#",
  "+",
  "~",
  "<",
  ">",
  "@",
  "_",
  "!",
  ")",
  "]",
  "%",
  "$",
  "*",
  " ",
  "^",
  "'",
  '"',
  "=",
  "M",
]);

export type ItemKind = "potion" | "weapon" | "gold" | "amulet" | "armor" | "food";

export type ItemRarity = "common" | "fine" | "mastercraft";

export type PotionKind = "heal" | "antidote" | "vigor";

export type Item = {
  id: number;
  kind: ItemKind;
  name: string;
  glyph: string;
  x: number;
  z: number;
  weaponAtk?: number;
  armorDef?: number;
  gold?: number;
  price?: number;
  rarity?: ItemRarity;
  affixIds?: string[];
  potionKind?: PotionKind;
};

export type MonsterKind = string;

export type Monster = {
  id: number;
  kind: MonsterKind;
  name: string;
  glyph: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  awake: boolean;
  fleeing: boolean;
  elite: boolean;
};

export type LootTable = {
  potionChance: number;
  foodChance: number;
  weaponChance?: number;
  armorChance?: number;
  goldChance: number;
  goldMin: number;
  goldMax: number;
};

export const DEFAULT_LOOT_TABLE: LootTable = {
  potionChance: 0.08,
  foodChance: 0.1,
  goldChance: 0.22,
  goldMin: 2,
  goldMax: 8,
};

export type MonsterDef = {
  id: string;
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  minDepth: number;
  maxDepth?: number;
  weight: number;
  palette: ThemeColorKey;
  yScale: number;
  sizeMul: number;
  glow: boolean;
  canOpenDoors: boolean;
  poison: boolean;
  steals: boolean;
  erratic: boolean;
  flees: boolean;
  guardian: boolean;
  bleed: boolean;
  burns: boolean;
  ranged: boolean;
  range: number;
  packAlert: boolean;
  loot?: LootTable;
};

export type WeaponDef = {
  id: string;
  name: string;
  atk: number;
  minDepth: number;
  price?: number;
};

export type ArmorDef = {
  id: string;
  name: string;
  def: number;
  minDepth: number;
  price?: number;
};

export type VitalsDef = {
  potionHeal: number;
  foodHeal: number;
};

export type AffixProc = "lifesteal" | "keen" | "thorns" | "wardStatus";

export type AffixDef = {
  id: string;
  label: string;
  atkBonus?: number;
  defBonus?: number;
  // informational only: special effects (lifesteal, keen crit, thorns, wardStatus) are
  // wired in game.ts/inventory.ts by matching an affix's fixed `id`, not this field, so
  // renaming/removing the built-in affixes silently drops their special behavior.
  proc?: AffixProc;
};

export type RarityTierDef = {
  weightBase: number;
  weightSlope: number;
  weightMin: number;
  weightMax: number;
  affixSlots: number;
  priceMul: number;
};

export type BalanceDef = {
  rarityCommonPriceMul: number;
  rarityCommonAffixSlots: number;
  rarityFine: RarityTierDef;
  rarityMastercraft: RarityTierDef;
  weaponAffixes: AffixDef[];
  armorAffixes: AffixDef[];
  potionAntidoteBase: number;
  potionAntidoteSlope: number;
  potionAntidoteMin: number;
  potionAntidoteMax: number;
  potionVigorBase: number;
  potionVigorSlope: number;
  potionVigorMin: number;
  potionVigorMax: number;
  eliteDepthOffset: number;
  eliteChanceSlope: number;
  eliteChanceCap: number;
  eliteDropBoost: number;
  eliteHpMul: number;
  eliteAtkMul: number;
  eliteDefBonus: number;
  critChance: number;
  shopOfferMin: number;
  shopOfferMax: number;
  shopSellMul: number;
  shopSaleMul: number;
  shopDepthPriceSlope: number;
};

export const DEFAULT_BALANCE: BalanceDef = {
  rarityCommonPriceMul: 1,
  rarityCommonAffixSlots: 0,
  rarityFine: { weightBase: 14, weightSlope: 3, weightMin: 14, weightMax: 46, affixSlots: 1, priceMul: 1.5 },
  rarityMastercraft: { weightBase: 2, weightSlope: 2, weightMin: 2, weightMax: 22, affixSlots: 2, priceMul: 2.4 },
  weaponAffixes: [
    { id: "heavy", label: "heavy", atkBonus: 1 },
    { id: "vampiric", label: "vampiric", proc: "lifesteal" },
    { id: "keen", label: "keen", proc: "keen" },
  ],
  armorAffixes: [
    { id: "sturdy", label: "sturdy", defBonus: 1 },
    { id: "thorned", label: "thorned", proc: "thorns" },
    { id: "warded", label: "warded", proc: "wardStatus" },
  ],
  potionAntidoteBase: 8,
  potionAntidoteSlope: 1.5,
  potionAntidoteMin: 8,
  potionAntidoteMax: 22,
  potionVigorBase: 2,
  potionVigorSlope: 1.5,
  potionVigorMin: 2,
  potionVigorMax: 18,
  eliteDepthOffset: 2,
  eliteChanceSlope: 0.035,
  eliteChanceCap: 0.25,
  eliteDropBoost: 1.6,
  eliteHpMul: 1.4,
  eliteAtkMul: 1.3,
  eliteDefBonus: 1,
  critChance: 0.18,
  shopOfferMin: 4,
  shopOfferMax: 6,
  shopSellMul: 0.4,
  shopSaleMul: 0.7,
  shopDepthPriceSlope: 0.15,
};

export type CatalogData = {
  vitals: VitalsDef;
  weapons: WeaponDef[];
  armors: ArmorDef[];
  monsters: MonsterDef[];
  balance: BalanceDef;
};

const builtinCatalog = parseCatalog(builtinJson) ?? emptyCatalog();

let current: CatalogData = cloneCatalog(builtinCatalog);

export function bootCatalog(): void {
  current = cloneCatalog(builtinCatalog);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = parseCatalog(JSON.parse(raw));
    if (parsed) current = parsed;
  } catch {
    /* keep builtin */
  }
}

export function getCatalog(): CatalogData {
  return current;
}

export function builtinSnapshot(): CatalogData {
  return cloneCatalog(builtinCatalog);
}

export function cloneCatalog(data: CatalogData): CatalogData {
  return {
    vitals: { ...data.vitals },
    weapons: data.weapons.map((w) => ({ ...w })),
    armors: data.armors.map((a) => ({ ...a })),
    monsters: data.monsters.map((m) => ({ ...m })),
    balance: cloneBalance(data.balance),
  };
}

export function cloneBalance(data: BalanceDef): BalanceDef {
  return {
    ...data,
    rarityFine: { ...data.rarityFine },
    rarityMastercraft: { ...data.rarityMastercraft },
    weaponAffixes: data.weaponAffixes.map((a) => ({ ...a })),
    armorAffixes: data.armorAffixes.map((a) => ({ ...a })),
  };
}

export function setCatalog(data: CatalogData): void {
  current = cloneCatalog(data);
}

export function persistCatalog(data: CatalogData = current): void {
  current = cloneCatalog(data);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore quota */
  }
}

export function resetCatalog(): CatalogData {
  current = cloneCatalog(builtinCatalog);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return cloneCatalog(current);
}

export function listMonsters(): MonsterDef[] {
  return current.monsters;
}

export function listWeapons(): WeaponDef[] {
  return current.weapons;
}

export function listArmors(): ArmorDef[] {
  return current.armors;
}

export function potionHeal(): number {
  return current.vitals.potionHeal;
}

export function foodHeal(): number {
  return current.vitals.foodHeal;
}

export function getBalance(): BalanceDef {
  return current.balance;
}

export function monsterDef(kind: MonsterKind): MonsterDef {
  return current.monsters.find((m) => m.id === kind) ?? current.monsters[0]!;
}

export function monsterByGlyph(ch: string): MonsterDef | undefined {
  return current.monsters.find((m) => m.glyph === ch);
}

export function guardianDef(): MonsterDef {
  return current.monsters.find((m) => m.guardian) ?? current.monsters[current.monsters.length - 1]!;
}

export function parseCatalog(raw: unknown): CatalogData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const vitals = parseVitals(o.vitals);
  const weapons = Array.isArray(o.weapons)
    ? o.weapons.map(parseWeapon).filter((x): x is WeaponDef => !!x)
    : [];
  const armors = Array.isArray(o.armors)
    ? o.armors.map(parseArmor).filter((x): x is ArmorDef => !!x)
    : [];
  const monsters = Array.isArray(o.monsters)
    ? o.monsters.map(parseMonster).filter((x): x is MonsterDef => !!x)
    : [];
  if (!weapons.length || !armors.length || !monsters.length) return null;
  return {
    vitals,
    weapons: uniqueById(weapons),
    armors: uniqueById(armors),
    monsters: uniqueById(monsters),
    balance: parseBalance(o.balance),
  };
}

export function catalogWarnings(data: CatalogData): string[] {
  const warns: string[] = [];
  const glyphs = new Map<string, string>();
  for (const m of data.monsters) {
    if (!m.glyph) {
      warns.push(`${m.name} needs a glyph`);
      continue;
    }
    if (RESERVED_GLYPHS.has(m.glyph)) {
      warns.push(`${m.name} glyph ${m.glyph} is used by the dungeon`);
    }
    const prev = glyphs.get(m.glyph);
    if (prev) warns.push(`${m.name} and ${prev} share glyph ${m.glyph}`);
    else glyphs.set(m.glyph, m.name);
  }
  if (!data.monsters.some((m) => m.guardian)) {
    warns.push("no guardian marked; deepest floor will pick the last beast");
  }
  if (!data.monsters.some((m) => m.minDepth <= 1)) {
    warns.push("no beast available at depth 1; spawns will fall back to the full list");
  }
  if (!data.weapons.some((w) => w.minDepth <= 1)) {
    warns.push("no weapon available at depth 1; drops will fall back to the full list");
  }
  if (!data.armors.some((a) => a.minDepth <= 1)) {
    warns.push("no armor available at depth 1; drops will fall back to the full list");
  }
  warnDupeIds(data.weapons, "weapon", warns);
  warnDupeIds(data.armors, "armor", warns);
  for (const w of data.weapons) {
    if (w.price != null && w.price <= 0) warns.push(`${w.name} has a non-positive price`);
  }
  for (const a of data.armors) {
    if (a.price != null && a.price <= 0) warns.push(`${a.name} has a non-positive price`);
  }
  return warns;
}

function warnDupeIds(rows: { id: string; name: string }[], label: string, warns: string[]): void {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const prev = seen.get(row.id);
    if (prev) warns.push(`${label}s "${prev}" and "${row.name}" share id ${row.id}`);
    else seen.set(row.id, row.name);
  }
}

export function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entry";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export function blankMonster(taken: Set<string>): MonsterDef {
  return {
    id: slugId("beast", taken),
    name: "beast",
    glyph: "x",
    hp: 6,
    atk: 2,
    def: 0,
    minDepth: 1,
    weight: 10,
    palette: "goblin",
    yScale: 1,
    sizeMul: 1,
    glow: false,
    canOpenDoors: false,
    poison: false,
    steals: false,
    erratic: false,
    flees: false,
    guardian: false,
    bleed: false,
    burns: false,
    ranged: false,
    range: 3,
    packAlert: false,
  };
}

export function blankWeapon(taken: Set<string>): WeaponDef {
  return {
    id: slugId("blade", taken),
    name: "blade",
    atk: 4,
    minDepth: 1,
    price: 20,
  };
}

export function blankArmor(taken: Set<string>): ArmorDef {
  return {
    id: slugId("hide", taken),
    name: "hide",
    def: 1,
    minDepth: 1,
    price: 14,
  };
}

export function blankAffix(kind: "weapon" | "armor", taken: Set<string>): AffixDef {
  const label = kind === "weapon" ? "keen edge" : "reinforced";
  const id = slugId(label, taken);
  return kind === "weapon" ? { id, label, atkBonus: 1 } : { id, label, defBonus: 1 };
}

function emptyCatalog(): CatalogData {
  return {
    vitals: { potionHeal: 8, foodHeal: 4 },
    weapons: [{ id: "stick", name: "stick", atk: 3, minDepth: 1 }],
    armors: [{ id: "rags", name: "rags", def: 1, minDepth: 1 }],
    monsters: [
      {
        id: "rat",
        name: "rat",
        glyph: "r",
        hp: 3,
        atk: 1,
        def: 0,
        minDepth: 1,
        weight: 10,
        palette: "rat",
        yScale: 1,
        sizeMul: 1,
        glow: false,
        canOpenDoors: false,
        poison: false,
        steals: false,
        erratic: false,
        flees: false,
        guardian: true,
        bleed: false,
        burns: false,
        ranged: false,
        range: 3,
        packAlert: false,
      },
    ],
    balance: cloneBalance(DEFAULT_BALANCE),
  };
}

function parseVitals(raw: unknown): VitalsDef {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    potionHeal: clampInt(o.potionHeal, 1, 99, 8),
    foodHeal: clampInt(o.foodHeal, 1, 99, 4),
  };
}

function parseWeapon(raw: unknown): WeaponDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name, "");
  if (!name) return null;
  return {
    id: str(o.id, slugId(name, new Set())),
    name,
    atk: clampInt(o.atk, 0, 99, 3),
    minDepth: clampInt(o.minDepth, 1, 99, 1),
    price: clampInt(o.price, 0, 999, (typeof o.atk === "number" ? o.atk : 3) * 8),
  };
}

function parseArmor(raw: unknown): ArmorDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name, "");
  if (!name) return null;
  return {
    id: str(o.id, slugId(name, new Set())),
    name,
    def: clampInt(o.def, 0, 99, 1),
    minDepth: clampInt(o.minDepth, 1, 99, 1),
    price: clampInt(o.price, 0, 999, (typeof o.def === "number" ? o.def : 1) * 14),
  };
}

function parseMonster(raw: unknown): MonsterDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name, "");
  if (!name) return null;
  const paletteRaw = str(o.palette, "goblin");
  const palette: ThemeColorKey = isThemeColorKey(paletteRaw) ? paletteRaw : "goblin";
  const maxRaw = o.maxDepth;
  const maxDepth =
    maxRaw === null || maxRaw === undefined || maxRaw === ""
      ? undefined
      : clampInt(maxRaw, 1, 99, 8);
  return {
    id: str(o.id, slugId(name, new Set())),
    name,
    glyph: str(o.glyph, "?").slice(0, 1) || "?",
    hp: clampInt(o.hp, 1, 99, 5),
    atk: clampInt(o.atk, 0, 99, 2),
    def: clampInt(o.def, 0, 99, 0),
    minDepth: clampInt(o.minDepth, 1, 99, 1),
    maxDepth,
    weight: clampInt(o.weight, 0, 999, 10),
    palette,
    yScale: clampNum(o.yScale, 0.3, 2.5, 1),
    sizeMul: clampNum(o.sizeMul, 0.5, 2, 1),
    glow: bool(o.glow),
    canOpenDoors: bool(o.canOpenDoors),
    poison: bool(o.poison),
    steals: bool(o.steals),
    erratic: bool(o.erratic),
    flees: bool(o.flees),
    guardian: bool(o.guardian),
    bleed: bool(o.bleed),
    burns: bool(o.burns),
    ranged: bool(o.ranged),
    range: clampInt(o.range, 1, 8, 3),
    packAlert: bool(o.packAlert),
    loot: parseLoot(o.loot),
  };
}

function parseLoot(raw: unknown): LootTable | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    potionChance: clampNum(o.potionChance, 0, 1, 0.08),
    foodChance: clampNum(o.foodChance, 0, 1, 0.1),
    weaponChance: o.weaponChance == null ? undefined : clampNum(o.weaponChance, 0, 1, 0),
    armorChance: o.armorChance == null ? undefined : clampNum(o.armorChance, 0, 1, 0),
    goldChance: clampNum(o.goldChance, 0, 1, 0.22),
    goldMin: clampInt(o.goldMin, 0, 999, 2),
    goldMax: clampInt(o.goldMax, 0, 999, 8),
  };
}

function parseRarityTier(raw: unknown, fallback: RarityTierDef): RarityTierDef {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    weightBase: clampNum(o.weightBase, 0, 100, fallback.weightBase),
    weightSlope: clampNum(o.weightSlope, 0, 20, fallback.weightSlope),
    weightMin: clampNum(o.weightMin, 0, 100, fallback.weightMin),
    weightMax: clampNum(o.weightMax, 0, 100, fallback.weightMax),
    affixSlots: clampInt(o.affixSlots, 0, 6, fallback.affixSlots),
    priceMul: clampNum(o.priceMul, 0.1, 10, fallback.priceMul),
  };
}

function parseAffix(raw: unknown, fallback: AffixDef): AffixDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.label, "");
  if (!label) return null;
  const procRaw = str(o.proc, "");
  const proc: AffixProc | undefined = (
    ["lifesteal", "keen", "thorns", "wardStatus"] as const
  ).includes(procRaw as AffixProc)
    ? (procRaw as AffixProc)
    : undefined;
  return {
    id: str(o.id, slugId(label, new Set())),
    label,
    atkBonus: o.atkBonus == null ? undefined : clampNum(o.atkBonus, -9, 9, fallback.atkBonus ?? 0),
    defBonus: o.defBonus == null ? undefined : clampNum(o.defBonus, -9, 9, fallback.defBonus ?? 0),
    proc,
  };
}

function parseAffixList(raw: unknown, fallback: AffixDef[]): AffixDef[] {
  if (!Array.isArray(raw)) return fallback.map((a) => ({ ...a }));
  const out = raw
    .map((row, i) => parseAffix(row, fallback[i] ?? fallback[0]!))
    .filter((x): x is AffixDef => !!x);
  return uniqueById(out.length ? out : fallback.map((a) => ({ ...a })));
}

function parseBalance(raw: unknown): BalanceDef {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_BALANCE;
  return {
    rarityCommonPriceMul: clampNum(o.rarityCommonPriceMul, 0.1, 10, d.rarityCommonPriceMul),
    rarityCommonAffixSlots: clampInt(o.rarityCommonAffixSlots, 0, 6, d.rarityCommonAffixSlots),
    rarityFine: parseRarityTier(o.rarityFine, d.rarityFine),
    rarityMastercraft: parseRarityTier(o.rarityMastercraft, d.rarityMastercraft),
    weaponAffixes: parseAffixList(o.weaponAffixes, d.weaponAffixes),
    armorAffixes: parseAffixList(o.armorAffixes, d.armorAffixes),
    potionAntidoteBase: clampNum(o.potionAntidoteBase, 0, 100, d.potionAntidoteBase),
    potionAntidoteSlope: clampNum(o.potionAntidoteSlope, 0, 20, d.potionAntidoteSlope),
    potionAntidoteMin: clampNum(o.potionAntidoteMin, 0, 100, d.potionAntidoteMin),
    potionAntidoteMax: clampNum(o.potionAntidoteMax, 0, 100, d.potionAntidoteMax),
    potionVigorBase: clampNum(o.potionVigorBase, 0, 100, d.potionVigorBase),
    potionVigorSlope: clampNum(o.potionVigorSlope, 0, 20, d.potionVigorSlope),
    potionVigorMin: clampNum(o.potionVigorMin, 0, 100, d.potionVigorMin),
    potionVigorMax: clampNum(o.potionVigorMax, 0, 100, d.potionVigorMax),
    eliteDepthOffset: clampNum(o.eliteDepthOffset, 0, 20, d.eliteDepthOffset),
    eliteChanceSlope: clampNum(o.eliteChanceSlope, 0, 1, d.eliteChanceSlope),
    eliteChanceCap: clampNum(o.eliteChanceCap, 0, 1, d.eliteChanceCap),
    eliteDropBoost: clampNum(o.eliteDropBoost, 0.1, 10, d.eliteDropBoost),
    eliteHpMul: clampNum(o.eliteHpMul, 0.1, 10, d.eliteHpMul),
    eliteAtkMul: clampNum(o.eliteAtkMul, 0.1, 10, d.eliteAtkMul),
    eliteDefBonus: clampInt(o.eliteDefBonus, 0, 20, d.eliteDefBonus),
    critChance: clampNum(o.critChance, 0, 1, d.critChance),
    shopOfferMin: clampInt(o.shopOfferMin, 1, 20, d.shopOfferMin),
    shopOfferMax: clampInt(o.shopOfferMax, 1, 20, d.shopOfferMax),
    shopSellMul: clampNum(o.shopSellMul, 0, 2, d.shopSellMul),
    shopSaleMul: clampNum(o.shopSaleMul, 0, 1, d.shopSaleMul),
    shopDepthPriceSlope: clampNum(o.shopDepthPriceSlope, 0, 2, d.shopDepthPriceSlope),
  };
}

function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of list) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

let nextId = 1;
export function allocId(): number {
  return nextId++;
}

export function woundedName(m: Monster): string {
  if (m.hp <= m.maxHp / 2) return `wounded ${m.name}`;
  return m.name;
}

export function aAn(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}

export function makePotion(x: number, z: number): Item {
  return { id: allocId(), kind: "potion", name: "potion", glyph: "!", x, z };
}

export function makeFood(x: number, z: number): Item {
  return { id: allocId(), kind: "food", name: "ration", glyph: "%", x, z };
}

export function makeGold(x: number, z: number, gold: number): Item {
  return { id: allocId(), kind: "gold", name: "gold", glyph: "$", x, z, gold };
}

export function makeAmulet(x: number, z: number): Item {
  return { id: allocId(), kind: "amulet", name: "amulet", glyph: "*", x, z };
}

export function makeWeapon(x: number, z: number, w: WeaponDef): Item {
  return {
    id: allocId(),
    kind: "weapon",
    name: w.name,
    glyph: ")",
    x,
    z,
    weaponAtk: w.atk,
    price: w.price ?? w.atk * 8,
  };
}

export function makeArmor(x: number, z: number, a: ArmorDef): Item {
  return {
    id: allocId(),
    kind: "armor",
    name: a.name,
    glyph: "]",
    x,
    z,
    armorDef: a.def,
    price: a.price ?? a.def * 14,
  };
}

export function pickWeapon(
  depth: number,
  rng: { pick: <T>(arr: readonly T[]) => T },
): WeaponDef {
  const all = current.weapons;
  const pool = all.filter((w) => w.minDepth <= depth);
  return rng.pick(pool.length ? pool : all);
}

export function pickArmor(
  depth: number,
  rng: { pick: <T>(arr: readonly T[]) => T },
): ArmorDef {
  const all = current.armors;
  const pool = all.filter((a) => a.minDepth <= depth);
  return rng.pick(pool.length ? pool : all);
}

export function pickMonsterDef(
  depth: number,
  rng: { next: () => number; pick: <T>(arr: readonly T[]) => T },
): MonsterDef {
  const all = current.monsters;
  const pool = all.filter(
    (d) => d.minDepth <= depth && (d.maxDepth == null || depth <= d.maxDepth),
  );
  const use = pool.length ? pool : all;
  return pickWeighted(use, rng);
}

export function pickMonsterDefForNest(
  depth: number,
  rng: { next: () => number; pick: <T>(arr: readonly T[]) => T },
): MonsterDef {
  const all = current.monsters.filter(
    (d) =>
      !d.guardian &&
      d.minDepth <= depth &&
      (d.maxDepth == null || depth <= d.maxDepth),
  );
  const small = all.filter((d) => d.hp <= 7 && !d.ranged);
  const use = small.length ? small : all.length ? all : current.monsters;
  return pickWeighted(use, rng);
}

export function makeMonsterFromKind(
  kind: MonsterKind,
  x: number,
  z: number,
  elite = false,
): Monster {
  const d = monsterDef(kind);
  const b = current.balance;
  const hp = elite ? Math.round(d.hp * b.eliteHpMul) : d.hp;
  const atk = elite ? Math.round(d.atk * b.eliteAtkMul) : d.atk;
  const def = elite ? d.def + b.eliteDefBonus : d.def;
  return {
    id: allocId(),
    kind: d.id,
    name: elite ? `elite ${d.name}` : d.name,
    glyph: d.glyph,
    x,
    z,
    hp,
    maxHp: hp,
    atk,
    def,
    awake: false,
    fleeing: false,
    elite,
  };
}

export function packLetter(index: number): string {
  return String.fromCharCode(97 + index);
}

export function letterIndex(code: string): number | null {
  if (code.length !== 4 || !code.startsWith("Key")) return null;
  const ch = code.slice(3);
  if (ch.length !== 1) return null;
  const n = ch.charCodeAt(0) - 65;
  if (n < 0 || n >= PACK_SIZE) return null;
  return n;
}

function pickWeighted(
  defs: MonsterDef[],
  rng: { next: () => number; pick: <T>(arr: readonly T[]) => T },
): MonsterDef {
  const total = defs.reduce((s, d) => s + Math.max(0, d.weight), 0);
  if (total <= 0) return rng.pick(defs);
  let n = rng.next() * total;
  for (const d of defs) {
    n -= Math.max(0, d.weight);
    if (n <= 0) return d;
  }
  return defs[defs.length - 1]!;
}

export function actorTileFromDef(def: MonsterDef): {
  color: number;
  yScale: number;
  sizeMul: number;
  emissive: number;
  roughness: number;
  metalness: number;
} {
  const pal = getColors();
  const color = pal[def.palette] ?? pal.goblin;
  return {
    color,
    yScale: def.yScale,
    sizeMul: def.sizeMul,
    emissive: def.glow ? color : 0,
    roughness: 0.52,
    metalness: 0.1,
  };
}
