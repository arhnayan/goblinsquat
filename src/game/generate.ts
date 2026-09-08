import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_DEPTH,
  type Cell,
  type Dungeon,
} from "./dungeon";
import type { Rng } from "./rng";

export type MonsterKind = "r" | "g" | "O" | "&";

export type ItemKind = "potion" | "weapon" | "gold" | "amulet";

export type Item = {
  id: number;
  kind: ItemKind;
  glyph: string;
  x: number;
  z: number;
  weaponName?: string;
  weaponAtk?: number;
  gold?: number;
};

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
};

export type Floor = {
  depth: number;
  dungeon: Dungeon;
  items: Item[];
  monsters: Monster[];
  seen: boolean[][];
};

type Room = { x: number; z: number; w: number; h: number };

const WEAPONS = [
  { name: "rusty shank", atk: 3 },
  { name: "iron pipe", atk: 4 },
  { name: "goblin cleaver", atk: 5 },
] as const;

let nextId = 1;
export function allocId(): number {
  return nextId++;
}

export function generateFloor(rng: Rng, depth: number): Floor {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const tiles: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "#"),
  );

  const rooms: Room[] = [];
  const want = rng.range(6, 9);
  for (let n = 0; n < 80 && rooms.length < want; n++) {
    const w = rng.range(4, 9);
    const h = rng.range(4, 7);
    const x = rng.range(1, width - w - 2);
    const z = rng.range(1, height - h - 2);
    const cand = { x, z, w, h };
    if (rooms.some((r) => overlap(r, cand, 1))) continue;
    rooms.push(cand);
    carveRoom(tiles, cand);
  }

  if (rooms.length < 4) {
    const fallback = [
      { x: 2, z: 2, w: 8, h: 6 },
      { x: 22, z: 2, w: 8, h: 6 },
      { x: 2, z: 14, w: 8, h: 6 },
      { x: 22, z: 14, w: 8, h: 6 },
    ];
    for (const r of fallback) {
      if (rooms.some((o) => overlap(o, r, 1))) continue;
      rooms.push(r);
      carveRoom(tiles, r);
    }
  }

  for (let i = 1; i < rooms.length; i++) {
    connect(tiles, rooms[i - 1], rooms[i], rooms);
  }
  if (rng.chance(0.45) && rooms.length > 2) {
    connect(tiles, rooms[0], rooms[rooms.length - 1], rooms);
  }

  if (depth === 1) stampTitle(tiles, width);

  puddles(tiles, rooms, rng);

  const spawnRoom = rooms[0];
  let far = rooms[1] ?? rooms[0];
  let farDist = -1;
  for (const r of rooms) {
    const d =
      Math.abs(center(spawnRoom).x - center(r).x) +
      Math.abs(center(spawnRoom).z - center(r).z);
    if (d > farDist) {
      farDist = d;
      far = r;
    }
  }

  const stairsUp = pickFloor(tiles, spawnRoom, rng);
  const stairsDown =
    depth < MAX_DEPTH ? pickFloor(tiles, far, rng, stairsUp) : null;

  tiles[stairsUp.z][stairsUp.x] = "<";
  if (stairsDown) tiles[stairsDown.z][stairsDown.x] = ">";

  const spawn = pickFloor(tiles, spawnRoom, rng, stairsUp, stairsDown);

  const dungeon: Dungeon = {
    width,
    height,
    tiles,
    spawn,
    stairsUp,
    stairsDown,
  };

  const used = new Set<string>([
    key(spawn),
    key(stairsUp),
    ...(stairsDown ? [key(stairsDown)] : []),
  ]);

  const items: Item[] = [];
  const monsters: Monster[] = [];

  scatterItems(rng, depth, tiles, rooms, used, items, stairsDown);
  scatterMonsters(rng, depth, tiles, rooms, used, monsters, far, stairsDown);

  const seen = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false),
  );

  return { depth, dungeon, items, monsters, seen };
}

function key(c: Cell): string {
  return `${c.x},${c.z}`;
}

function overlap(a: Room, b: Room, pad: number): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.z + a.h + pad <= b.z ||
    b.z + b.h + pad <= a.z
  );
}

function center(r: Room): Cell {
  return { x: r.x + Math.floor(r.w / 2), z: r.z + Math.floor(r.h / 2) };
}

function carveRoom(tiles: string[][], r: Room): void {
  for (let z = r.z; z < r.z + r.h; z++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      tiles[z][x] = ".";
    }
  }
}

function inRoom(r: Room, x: number, z: number): boolean {
  return x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;
}

function onRoomWall(rooms: Room[], x: number, z: number): boolean {
  return rooms.some(
    (r) =>
      x >= r.x - 1 &&
      x <= r.x + r.w &&
      z >= r.z - 1 &&
      z <= r.z + r.h &&
      !inRoom(r, x, z),
  );
}

function connect(tiles: string[][], a: Room, b: Room, rooms: Room[]): void {
  const ca = center(a);
  const cb = center(b);
  let x = ca.x;
  let z = ca.z;
  const hx = cb.x >= ca.x ? 1 : -1;
  while (x !== cb.x) {
    x += hx;
    carveTunnel(tiles, rooms, x, z);
  }
  const vz = cb.z >= ca.z ? 1 : -1;
  while (z !== cb.z) {
    z += vz;
    carveTunnel(tiles, rooms, x, z);
  }
}

function carveTunnel(
  tiles: string[][],
  rooms: Room[],
  x: number,
  z: number,
): void {
  if (z < 0 || x < 0 || z >= tiles.length || x >= tiles[0].length) return;
  const cur = tiles[z][x];
  if (cur === "." || cur === "<" || cur === ">" || cur === "~") return;
  if (cur === "#" && onRoomWall(rooms, x, z)) {
    tiles[z][x] = "+";
    return;
  }
  if (cur === "#") tiles[z][x] = ".";
}

function stampTitle(tiles: string[][], width: number): void {
  const title = "GOBLINSQUAT";
  const start = Math.max(2, Math.floor((width - title.length) / 2));
  let z = 0;
  const rowFits = (row: number) =>
    title.split("").every((_, i) => tiles[row]?.[start + i] === "#");
  if (tiles[1] && rowFits(1)) z = 1;
  for (let i = 0; i < title.length; i++) {
    const x = start + i;
    if (tiles[z]?.[x] === "#") tiles[z][x] = title[i]!;
  }
}

function puddles(tiles: string[][], rooms: Room[], rng: Rng): void {
  const n = rng.range(0, 2);
  for (let i = 0; i < n; i++) {
    const r = rng.pick(rooms);
    const x = r.x + rng.int(Math.max(1, r.w - 2));
    const z = r.z + rng.int(Math.max(1, r.h - 2));
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        const tz = z + dz;
        if (tiles[tz]?.[tx] === ".") tiles[tz][tx] = "~";
      }
    }
  }
}

function pickFloor(
  tiles: string[][],
  room: Room,
  rng: Rng,
  ...avoid: (Cell | null | undefined)[]
): Cell {
  const avoidKeys = new Set(
    avoid.filter(Boolean).map((c) => `${c!.x},${c!.z}`),
  );
  for (let n = 0; n < 80; n++) {
    const x = room.x + rng.int(room.w);
    const z = room.z + rng.int(room.h);
    const ch = tiles[z][x];
    if ((ch === "." || ch === "~") && !avoidKeys.has(`${x},${z}`)) {
      return { x, z };
    }
  }
  return { x: room.x, z: room.z };
}

function freeCell(
  tiles: string[][],
  rooms: Room[],
  rng: Rng,
  used: Set<string>,
  prefer?: Room,
): Cell | null {
  const list = prefer ? [prefer, ...rooms] : rooms;
  for (let n = 0; n < 60; n++) {
    const r = rng.pick(list);
    const x = r.x + rng.int(r.w);
    const z = r.z + rng.int(r.h);
    const ch = tiles[z][x];
    if (ch !== "." && ch !== "~") continue;
    const k = `${x},${z}`;
    if (used.has(k)) continue;
    used.add(k);
    return { x, z };
  }
  return null;
}

function scatterItems(
  rng: Rng,
  depth: number,
  tiles: string[][],
  rooms: Room[],
  used: Set<string>,
  items: Item[],
  farStair: Cell | null,
): void {
  const potions = rng.range(1, depth >= 5 ? 2 : 2);
  for (let i = 0; i < potions; i++) {
    const c = freeCell(tiles, rooms, rng, used);
    if (!c) break;
    items.push({ id: allocId(), kind: "potion", glyph: "!", x: c.x, z: c.z });
  }
  if (rng.chance(0.35 + depth * 0.05)) {
    const c = freeCell(tiles, rooms, rng, used);
    if (c) {
      const w = rng.pick(WEAPONS);
      items.push({
        id: allocId(),
        kind: "weapon",
        glyph: ")",
        x: c.x,
        z: c.z,
        weaponName: w.name,
        weaponAtk: w.atk,
      });
    }
  }
  const goldN = rng.range(2, 5);
  for (let i = 0; i < goldN; i++) {
    const c = freeCell(tiles, rooms, rng, used);
    if (!c) break;
    items.push({
      id: allocId(),
      kind: "gold",
      glyph: "$",
      x: c.x,
      z: c.z,
      gold: rng.range(3, 12),
    });
  }
  if (depth === MAX_DEPTH) {
    const vault = rooms[rooms.length - 1];
    const c =
      freeCell(tiles, rooms, rng, used, vault) ??
      (farStair ? { x: farStair.x + 1, z: farStair.z } : null);
    if (c) {
      used.add(`${c.x},${c.z}`);
      items.push({ id: allocId(), kind: "amulet", glyph: "*", x: c.x, z: c.z });
    }
  }
}

function scatterMonsters(
  rng: Rng,
  depth: number,
  tiles: string[][],
  rooms: Room[],
  used: Set<string>,
  monsters: Monster[],
  far: Room,
  stairsDown: Cell | null,
): void {
  const count = 3 + depth + rng.int(3);
  for (let i = 0; i < count; i++) {
    const c = freeCell(tiles, rooms, rng, used);
    if (!c) break;
    monsters.push(makeMonster(rng, depth, c.x, c.z, false));
  }
  if (depth === MAX_DEPTH) {
    const c = freeCell(tiles, rooms, rng, used, far);
    if (c) {
      monsters.push(makeMonster(rng, depth, c.x, c.z, true));
    } else if (stairsDown) {
      const gx = stairsDown.x;
      const gz = stairsDown.z;
      monsters.push(makeMonster(rng, depth, gx, gz, true));
    }
  }
}

export function makeMonster(
  rng: Rng,
  depth: number,
  x: number,
  z: number,
  guardian: boolean,
): Monster {
  if (guardian) {
    return {
      id: allocId(),
      kind: "&",
      name: "squat-demon",
      glyph: "&",
      x,
      z,
      hp: 22,
      maxHp: 22,
      atk: 5,
      def: 1,
    };
  }
  const kind = pickKind(rng, depth);
  const stats = monsterStats(kind);
  return { id: allocId(), ...stats, x, z };
}

function pickKind(rng: Rng, depth: number): MonsterKind {
  if (depth >= 8) return rng.chance(0.4) ? "&" : rng.chance(0.5) ? "O" : "g";
  if (depth >= 6) return rng.chance(0.45) ? "O" : "g";
  if (depth >= 4) return rng.chance(0.3) ? "O" : rng.chance(0.7) ? "g" : "r";
  if (depth >= 2) return rng.chance(0.55) ? "g" : "r";
  return rng.chance(0.75) ? "r" : "g";
}

function monsterStats(kind: MonsterKind) {
  if (kind === "r") {
    return { kind, name: "rat", glyph: "r", hp: 3, maxHp: 3, atk: 1, def: 0 };
  }
  if (kind === "g") {
    return {
      kind,
      name: "goblin",
      glyph: "g",
      hp: 6,
      maxHp: 6,
      atk: 2,
      def: 0,
    };
  }
  if (kind === "O") {
    return { kind, name: "ogre", glyph: "O", hp: 14, maxHp: 14, atk: 4, def: 1 };
  }
  return {
    kind: "&" as const,
    name: "squat-demon",
    glyph: "&",
    hp: 18,
    maxHp: 18,
    atk: 5,
    def: 1,
  };
}
