import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_DEPTH,
  themeForDepth,
  type Cell,
  type Dungeon,
  type FloorThemeId,
} from "./dungeon";
import type { Rng } from "./rng";
import {
  guardianDef,
  makeAmulet,
  makeArmor,
  makeFood,
  makeGold,
  makeMonsterFromKind,
  makePotion,
  makeWeapon,
  pickArmor,
  pickMonsterDef,
  pickMonsterDefForNest,
  pickWeapon,
  type Item,
  type Monster,
  type MonsterKind,
} from "./catalog";
import { generateShopOffers, type ShopState } from "./shop";

export type { Item, Monster, MonsterKind };

export type RoomKind = "spawn" | "normal" | "treasure" | "shop" | "arena" | "nest";

export type RoomMeta = {
  x: number;
  z: number;
  w: number;
  h: number;
  kind: RoomKind;
};

export type Floor = {
  depth: number;
  dungeon: Dungeon;
  items: Item[];
  monsters: Monster[];
  seen: boolean[][];
  rooms: RoomMeta[];
  themeId: FloorThemeId;
  shop: ShopState | null;
  merchant: Cell | null;
};

export type GenerateOpts = {
  allowShop?: boolean;
};

type Room = { x: number; z: number; w: number; h: number };

export function generateFloor(
  rng: Rng,
  depth: number,
  opts: GenerateOpts = {},
): Floor {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const themeId = themeForDepth(depth);
  const tiles: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "#"),
  );

  const big = themeId === "deep" || themeId === "vault";
  const rooms: Room[] = [];
  const want = rng.range(6, 9);
  for (let n = 0; n < 80 && rooms.length < want; n++) {
    const w = rng.range(big ? 5 : 4, big ? 11 : 9);
    const h = rng.range(big ? 5 : 4, big ? 8 : 7);
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

  const loopChance = themeId === "warrens" ? 0.7 : 0.45;
  for (let i = 1; i < rooms.length; i++) {
    connect(tiles, rooms[i - 1]!, rooms[i]!, rooms);
  }
  if (rng.chance(loopChance) && rooms.length > 2) {
    connect(tiles, rooms[0]!, rooms[rooms.length - 1]!, rooms);
  }

  if (depth === 1) stampTitle(tiles, width);

  const spawnRoom = rooms[0]!;
  let far = rooms[1] ?? rooms[0]!;
  let farDist = -1;
  let farIndex = 1;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]!;
    const d =
      Math.abs(center(spawnRoom).x - center(r).x) +
      Math.abs(center(spawnRoom).z - center(r).z);
    if (d > farDist) {
      farDist = d;
      far = r;
      farIndex = i;
    }
  }

  const metas = assignKinds(rooms, farIndex, rng, depth, opts.allowShop === true);

  if (themeId === "deep" || themeId === "vault") emberPuddles(tiles, rooms, rng);
  else puddles(tiles, rooms, rng);
  if (themeId === "shallow") scatterRubble(tiles, rooms, rng);

  const stairsUp = pickFloor(tiles, spawnRoom, rng);
  const stairsDown =
    depth < MAX_DEPTH ? pickFloor(tiles, far, rng, stairsUp) : null;

  tiles[stairsUp.z][stairsUp.x] = "<";
  if (stairsDown) tiles[stairsDown.z][stairsDown.x] = ">";

  const spawn = pickFloor(tiles, spawnRoom, rng, stairsUp, stairsDown);

  let merchant: Cell | null = null;
  const shopRoom = metas.find((r) => r.kind === "shop");
  if (shopRoom) merchant = placeMerchant(tiles, shopRoom, spawn, stairsUp, stairsDown);

  stampTreasure(tiles, metas);
  scatterCorridorTraps(tiles, metas, rng, spawn, stairsUp, stairsDown);
  scatterRoomTraps(tiles, metas, rng, spawn, stairsUp, stairsDown);

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
    ...(merchant ? [key(merchant)] : []),
  ]);

  const items: Item[] = [];
  const monsters: Monster[] = [];

  scatterItems(rng, depth, tiles, metas, used, items, stairsDown);
  scatterMonsters(rng, depth, tiles, metas, used, monsters, far, stairsDown);
  stampSpecialSpawns(rng, depth, tiles, metas, used, items, monsters);

  const shop = merchant ? generateShopOffers(rng, depth) : null;

  const seen = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false),
  );

  return {
    depth,
    dungeon,
    items,
    monsters,
    seen,
    rooms: metas,
    themeId,
    shop,
    merchant,
  };
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
  if (z < 0 || x < 0 || z >= tiles.length || x >= tiles[0]!.length) return;
  const cur = tiles[z]![x]!;
  if (cur === "." || cur === "<" || cur === ">" || cur === "~") return;
  if (cur === "#" && onRoomWall(rooms, x, z)) {
    tiles[z]![x] = "+";
    return;
  }
  if (cur === "#") tiles[z]![x] = ".";
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
    if (tiles[z]?.[x] === "#") tiles[z]![x] = title[i]!;
  }
}

function puddles(tiles: string[][], rooms: Room[], rng: Rng): void {
  stampPuddles(tiles, rooms, rng, "~", rng.range(0, 2));
}

function emberPuddles(tiles: string[][], rooms: Room[], rng: Rng): void {
  stampPuddles(tiles, rooms, rng, "=", rng.range(1, 3));
}

function stampPuddles(
  tiles: string[][],
  rooms: Room[],
  rng: Rng,
  ch: string,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    const r = rng.pick(rooms);
    const x = r.x + rng.int(Math.max(1, r.w - 2));
    const z = r.z + rng.int(Math.max(1, r.h - 2));
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        const tz = z + dz;
        if (tiles[tz]?.[tx] === ".") tiles[tz]![tx] = ch;
      }
    }
  }
}

function scatterRubble(tiles: string[][], rooms: Room[], rng: Rng): void {
  const n = rng.range(4, 10);
  for (let i = 0; i < n; i++) {
    const r = rng.pick(rooms);
    const x = r.x + rng.int(r.w);
    const z = r.z + rng.int(r.h);
    if (tiles[z]?.[x] === ".") tiles[z]![x] = '"';
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
    const ch = tiles[z]![x]!;
    if ((ch === "." || ch === "~" || ch === "=" || ch === '"') && !avoidKeys.has(`${x},${z}`)) {
      return { x, z };
    }
  }
  return { x: room.x, z: room.z };
}

function assignKinds(
  rooms: Room[],
  farIndex: number,
  rng: Rng,
  depth: number,
  allowShop: boolean,
): RoomMeta[] {
  const kinds: RoomKind[] = rooms.map((_, i) => (i === 0 ? "spawn" : "normal"));
  const claimed = new Set<number>([0]);

  const claim = (kind: RoomKind, pred: (r: Room, i: number) => boolean): boolean => {
    const order = rooms.map((_, i) => i).filter((i) => !claimed.has(i));
    for (const i of shuffled(order, rng)) {
      if (!pred(rooms[i]!, i)) continue;
      claimed.add(i);
      kinds[i] = kind;
      return true;
    }
    return false;
  };

  if (depth === MAX_DEPTH && farIndex !== 0) {
    claimed.add(farIndex);
    kinds[farIndex] = "treasure";
  }

  if (allowShop && depth >= 2 && depth <= 5) {
    claim("shop", (r, i) => r.w >= 5 && r.h >= 5 && i !== farIndex);
  }

  if (depth >= 3 && depth !== MAX_DEPTH) {
    claim("treasure", (_r, i) => i !== farIndex);
  }

  if (depth >= 4 && rng.chance(0.25)) {
    claim("arena", (r) => r.w >= 6 && r.h >= 6);
  }

  if (rng.chance(0.3)) {
    claim("nest", () => true);
  }

  return rooms.map((r, i) => ({ ...r, kind: kinds[i]! }));
}

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function placeMerchant(
  tiles: string[][],
  room: RoomMeta,
  ...avoid: (Cell | null)[]
): Cell | null {
  const avoidKeys = new Set(
    avoid.filter(Boolean).map((c) => `${c!.x},${c!.z}`),
  );
  const cx = room.x + Math.floor(room.w / 2);
  const candidates = [
    { x: cx, z: room.z },
    { x: cx, z: room.z + 1 },
    { x: room.x + 1, z: room.z },
    { x: room.x + room.w - 2, z: room.z },
  ];
  for (const c of candidates) {
    const ch = tiles[c.z]?.[c.x];
    if (ch !== "." && ch !== "~" && ch !== '"' && ch !== "=") continue;
    if (avoidKeys.has(key(c))) continue;
    tiles[c.z]![c.x] = "M";
    return c;
  }
  return null;
}

function stampTreasure(tiles: string[][], rooms: RoomMeta[]): void {
  for (const r of rooms) {
    if (r.kind !== "treasure" || r.w < 5 || r.h < 5) continue;
    const x0 = r.x + Math.floor((r.w - 3) / 2);
    const z0 = r.z + Math.floor((r.h - 3) / 2);
    for (let z = z0; z < z0 + 3; z++) {
      for (let x = x0; x < x0 + 3; x++) {
        const ch = tiles[z]?.[x];
        if (ch === "." || ch === "~" || ch === "=") tiles[z]![x] = ".";
      }
    }
    const corners = [
      { x: x0, z: z0 },
      { x: x0 + 2, z: z0 },
      { x: x0, z: z0 + 2 },
      { x: x0 + 2, z: z0 + 2 },
    ];
    for (const c of corners) {
      if (tiles[c.z]?.[c.x] === ".") tiles[c.z]![c.x] = '"';
    }
  }
}

function canTrap(ch: string): boolean {
  return ch === "." || ch === '"' ;
}

function scatterCorridorTraps(
  tiles: string[][],
  rooms: RoomMeta[],
  rng: Rng,
  ...avoid: (Cell | null)[]
): void {
  const avoidKeys = new Set(
    avoid.filter(Boolean).map((c) => `${c!.x},${c!.z}`),
  );
  for (let z = 0; z < tiles.length; z++) {
    for (let x = 0; x < tiles[z]!.length; x++) {
      if (rooms.some((r) => inRoom(r, x, z))) continue;
      if (!canTrap(tiles[z]![x]!)) continue;
      if (avoidKeys.has(`${x},${z}`)) continue;
      if (!rng.chance(0.08)) continue;
      tiles[z]![x] = rng.chance(0.55) ? "^" : "'";
    }
  }
}

function scatterRoomTraps(
  tiles: string[][],
  rooms: RoomMeta[],
  rng: Rng,
  ...avoid: (Cell | null)[]
): void {
  const avoidKeys = new Set(
    avoid.filter(Boolean).map((c) => `${c!.x},${c!.z}`),
  );
  for (const r of rooms) {
    if (r.kind !== "treasure") continue;
    const n = rng.range(1, 2);
    let placed = 0;
    for (let t = 0; t < 40 && placed < n; t++) {
      const x = r.x + rng.int(r.w);
      const z = r.z + rng.int(r.h);
      if (!canTrap(tiles[z]![x]!)) continue;
      if (avoidKeys.has(`${x},${z}`)) continue;
      tiles[z]![x] = rng.chance(0.5) ? "^" : "'";
      avoidKeys.add(`${x},${z}`);
      placed += 1;
    }
  }
}

function freeCell(
  tiles: string[][],
  rooms: RoomMeta[],
  rng: Rng,
  used: Set<string>,
  prefer?: RoomMeta,
  avoidKinds: RoomKind[] = ["shop"],
): Cell | null {
  const pool = rooms.filter((r) => !avoidKinds.includes(r.kind));
  const list = prefer ? [prefer, ...pool] : pool.length ? pool : rooms;
  for (let n = 0; n < 60; n++) {
    const r = rng.pick(list);
    const x = r.x + rng.int(r.w);
    const z = r.z + rng.int(r.h);
    const ch = tiles[z]![x]!;
    if (ch !== "." && ch !== "~" && ch !== "=" && ch !== '"' && ch !== "^" && ch !== "'") {
      continue;
    }
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
  rooms: RoomMeta[],
  used: Set<string>,
  items: Item[],
  farStair: Cell | null,
): void {
  const potions = rng.range(1, 2);
  for (let i = 0; i < potions; i++) {
    const c = freeCell(tiles, rooms, rng, used);
    if (!c) break;
    items.push(makePotion(c.x, c.z));
  }
  const foodN = rng.range(1, 2);
  for (let i = 0; i < foodN; i++) {
    const c = freeCell(tiles, rooms, rng, used);
    if (!c) break;
    items.push(makeFood(c.x, c.z));
  }
  if (rng.chance(0.35 + depth * 0.05)) {
    const c = freeCell(tiles, rooms, rng, used);
    if (c) items.push(makeWeapon(c.x, c.z, pickWeapon(depth, rng)));
  }
  if (rng.chance(0.22 + depth * 0.04)) {
    const c = freeCell(tiles, rooms, rng, used);
    if (c) items.push(makeArmor(c.x, c.z, pickArmor(depth, rng)));
  }
  const goldN = rng.range(2, 5);
  for (let i = 0; i < goldN; i++) {
    const c = freeCell(tiles, rooms, rng, used);
    if (!c) break;
    items.push(makeGold(c.x, c.z, rng.range(3, 12)));
  }
  if (depth === MAX_DEPTH) {
    const vault = rooms.find((r) => r.kind === "treasure") ?? rooms[rooms.length - 1];
    const c =
      (vault ? freeCell(tiles, rooms, rng, used, vault) : null) ??
      (farStair ? { x: farStair.x + 1, z: farStair.z } : null);
    if (c) {
      used.add(`${c.x},${c.z}`);
      items.push(makeAmulet(c.x, c.z));
    }
  }
}

function scatterMonsters(
  rng: Rng,
  depth: number,
  tiles: string[][],
  rooms: RoomMeta[],
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
    const prefer =
      rooms.find((r) => r.kind === "treasure") ??
      rooms.find((r) => r.x === far.x && r.z === far.z);
    const c = freeCell(tiles, rooms, rng, used, prefer);
    if (c) {
      monsters.push(makeMonster(rng, depth, c.x, c.z, true));
    } else if (stairsDown) {
      monsters.push(makeMonster(rng, depth, stairsDown.x, stairsDown.z, true));
    }
  }
}

function stampSpecialSpawns(
  rng: Rng,
  depth: number,
  tiles: string[][],
  rooms: RoomMeta[],
  used: Set<string>,
  items: Item[],
  monsters: Monster[],
): void {
  for (const r of rooms) {
    if (r.kind === "treasure") {
      for (let i = 0; i < 2; i++) {
        const c = freeCell(tiles, rooms, rng, used, r);
        if (!c) break;
        if (rng.chance(0.5)) items.push(makeWeapon(c.x, c.z, pickWeapon(depth, rng)));
        else items.push(makeArmor(c.x, c.z, pickArmor(depth, rng)));
      }
      const goldN = rng.range(3, 6);
      for (let i = 0; i < goldN; i++) {
        const c = freeCell(tiles, rooms, rng, used, r);
        if (!c) break;
        items.push(makeGold(c.x, c.z, rng.range(6, 16)));
      }
    }
    if (r.kind === "arena") {
      const n = rng.range(4, 6);
      const cx = center(r);
      for (let i = 0; i < n; i++) {
        const c = freeCell(tiles, rooms, rng, used, r);
        if (!c) break;
        if (Math.abs(c.x - cx.x) < 1 && Math.abs(c.z - cx.z) < 1) {
          used.delete(`${c.x},${c.z}`);
          continue;
        }
        monsters.push(makeMonster(rng, depth, c.x, c.z, false));
      }
    }
    if (r.kind === "nest") {
      const def = pickMonsterDefForNest(depth, rng);
      const n = rng.range(3, 5);
      for (let i = 0; i < n; i++) {
        const c = freeCell(tiles, rooms, rng, used, r);
        if (!c) break;
        monsters.push(makeMonsterFromKind(def.id, c.x, c.z));
      }
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
  if (guardian) return makeMonsterFromKind(guardianDef().id, x, z);
  return makeMonsterFromKind(pickMonsterDef(depth, rng).id, x, z);
}
