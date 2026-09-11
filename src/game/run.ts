import { createRng, type Rng } from "./rng";
import { generateFloor, type Floor } from "./generate";
import { MAX_DEPTH } from "./dungeon";
import { UNARMED_ATK, type Item } from "./catalog";
import type { Status } from "./status";

export type Run = {
  seed: number;
  rng: Rng;
  depth: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  weaponId: number | null;
  armorId: number | null;
  trinketId: number | null;
  pack: Item[];
  gold: number;
  statuses: Status[];
  turns: number;
  hasAmulet: boolean;
  shopSpawned: boolean;
  usedRevive: boolean;
  status: "play" | "dead" | "won";
  floors: Map<number, Floor>;
};

export function newRun(seed = Date.now() >>> 0): Run {
  const rng = createRng(seed);
  const floors = new Map<number, Floor>();
  floors.set(1, generateFloor(rng, 1, { allowShop: false }));
  return {
    seed,
    rng,
    depth: 1,
    hp: 12,
    maxHp: 12,
    atk: UNARMED_ATK,
    def: 0,
    weaponId: null,
    armorId: null,
    trinketId: null,
    pack: [],
    gold: 0,
    statuses: [],
    turns: 0,
    hasAmulet: false,
    shopSpawned: false,
    usedRevive: false,
    status: "play",
    floors,
  };
}

export function getFloor(run: Run, depth: number): Floor {
  let floor = run.floors.get(depth);
  if (!floor) {
    const allowShop = !run.shopSpawned && depth >= 2 && depth <= 5;
    floor = generateFloor(run.rng, depth, { allowShop });
    if (floor.merchant) run.shopSpawned = true;
    run.floors.set(depth, floor);
  }
  return floor;
}

export function enterPos(
  floor: Floor,
  via: "start" | "down" | "up",
): { x: number; z: number } {
  if (via === "start") return floor.dungeon.spawn;
  if (via === "down") return floor.dungeon.stairsUp ?? floor.dungeon.spawn;
  return floor.dungeon.stairsDown ?? floor.dungeon.spawn;
}

export function canGoDeeper(run: Run): boolean {
  return run.depth < MAX_DEPTH;
}

export function parseSeed(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return null;
  return Number(t) >>> 0;
}

export function urlSeed(): number | null {
  const s = new URLSearchParams(window.location.search).get("seed");
  if (s == null || s === "") return null;
  return parseSeed(s);
}
