import { createRng, type Rng } from "./rng";
import { generateFloor, type Floor } from "./generate";
import { MAX_DEPTH } from "./dungeon";

export type Run = {
  seed: number;
  rng: Rng;
  depth: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  weapon: string | null;
  potions: number;
  gold: number;
  hasAmulet: boolean;
  status: "play" | "dead" | "won";
  floors: Map<number, Floor>;
};

export function newRun(seed = Date.now() >>> 0): Run {
  const rng = createRng(seed);
  const floors = new Map<number, Floor>();
  floors.set(1, generateFloor(rng, 1));
  return {
    seed,
    rng,
    depth: 1,
    hp: 12,
    maxHp: 12,
    atk: 2,
    def: 0,
    weapon: null,
    potions: 0,
    gold: 0,
    hasAmulet: false,
    status: "play",
    floors,
  };
}

export function getFloor(run: Run, depth: number): Floor {
  let floor = run.floors.get(depth);
  if (!floor) {
    floor = generateFloor(run.rng, depth);
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
