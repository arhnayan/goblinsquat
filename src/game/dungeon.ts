import { actorTileFromDef, monsterByGlyph } from "./catalog";
import { getColors } from "./theme";

export const CELL = 1.18;
export const MAX_DEPTH = 8;
export const FOV_RADIUS = 8;
export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 24;

export type FloorThemeId = "shallow" | "warrens" | "deep" | "vault";

let floorTheme: FloorThemeId = "shallow";

export function themeForDepth(depth: number): FloorThemeId {
  if (depth <= 2) return "shallow";
  if (depth <= 5) return "warrens";
  if (depth <= 7) return "deep";
  return "vault";
}

export function setFloorTheme(id: FloorThemeId): void {
  floorTheme = id;
}

export function getFloorTheme(): FloorThemeId {
  return floorTheme;
}

export function palette() {
  return getColors();
}

export type TileStyle = {
  color: number;
  yScale: number;
  sizeMul: number;
  emissive: number;
  roughness: number;
  metalness: number;
};

export type Cell = { x: number; z: number };

export type Dungeon = {
  width: number;
  height: number;
  tiles: string[][];
  spawn: Cell;
  stairsUp: Cell | null;
  stairsDown: Cell | null;
};

export function charAt(dungeon: Dungeon, x: number, z: number): string {
  if (x < 0 || z < 0 || x >= dungeon.width || z >= dungeon.height) return "#";
  return dungeon.tiles[z][x];
}

export function setTile(dungeon: Dungeon, x: number, z: number, ch: string): void {
  if (x < 0 || z < 0 || x >= dungeon.width || z >= dungeon.height) return;
  dungeon.tiles[z][x] = ch;
}


export function describeTile(ch: string): string {
  if (ch === ".") return "floor";
  if (ch === "#") return "a wall";
  if (ch === "+") return "a closed door";
  if (ch === "~") return "water";
  if (ch === ">") return "a staircase down";
  if (ch === "<") return "a staircase up";
  if (ch === " ") return "void";
  if (ch === "^" || ch === "'") return "floor";
  if (ch === '"') return "rubble";
  if (ch === "=") return "embers";
  if (ch === "M") return "a merchant";
  if (isLetterWall(ch)) return "carved stone";
  return "something";
}

export function isLetterWall(ch: string): boolean {
  return ch >= "A" && ch <= "Z" && ch !== "M";
}

export function isBlocked(ch: string): boolean {
  return ch === "#" || ch === "+" || ch === " " || ch === "M" || isLetterWall(ch);
}

export function isSlowTile(ch: string): boolean {
  return ch === "~" || ch === '"';
}

export function isWalkable(dungeon: Dungeon, x: number, z: number): boolean {
  return !isBlocked(charAt(dungeon, x, z));
}

export function isOpaque(dungeon: Dungeon, x: number, z: number): boolean {
  const ch = charAt(dungeon, x, z);
  return ch === "#" || ch === "+" || isLetterWall(ch);
}

export function worldPos(x: number, z: number): { x: number; z: number } {
  return { x: x * CELL, z: z * CELL };
}

export function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function themedFloor(base: number): number {
  const PALETTE = getColors();
  if (floorTheme === "warrens") return mixHex(base, PALETTE.wall, 0.12);
  if (floorTheme === "deep") return mixHex(base, PALETTE.demon, 0.18);
  if (floorTheme === "vault") return mixHex(base, PALETTE.gold, 0.1);
  return base;
}

function themedWall(base: number): number {
  const PALETTE = getColors();
  if (floorTheme === "warrens") return mixHex(base, PALETTE.void, 0.16);
  if (floorTheme === "deep") return mixHex(base, PALETTE.demon, 0.22);
  if (floorTheme === "vault") return mixHex(base, PALETTE.title, 0.12);
  return base;
}

export function tileStyle(ch: string): TileStyle {
  const PALETTE = getColors();
  if (ch === "." || ch === "^" || ch === "'") {
    return {
      color: themedFloor(PALETTE.floor),
      yScale: 0.9,
      sizeMul: 2.15,
      emissive: 0,
      roughness: 0.55,
      metalness: 0.08,
    };
  }
  if (ch === "#") {
    return {
      color: themedWall(PALETTE.wall),
      yScale: 1.22,
      sizeMul: 1,
      emissive: 0,
      roughness: 0.48,
      metalness: 0.22,
    };
  }
  if (ch === "+") {
    return {
      color: PALETTE.door,
      yScale: 0.82,
      sizeMul: 1,
      emissive: 0,
      roughness: 0.5,
      metalness: 0.18,
    };
  }
  if (ch === "~") {
    return {
      color: PALETTE.water,
      yScale: 0.55,
      sizeMul: 1.15,
      emissive: PALETTE.water,
      roughness: 0.28,
      metalness: 0.35,
    };
  }
  if (ch === '"') {
    return {
      color: mixHex(themedFloor(PALETTE.floor), PALETTE.wall, 0.45),
      yScale: 1.02,
      sizeMul: 1.05,
      emissive: 0,
      roughness: 0.62,
      metalness: 0.12,
    };
  }
  if (ch === "=") {
    return {
      color: mixHex(PALETTE.stairs, PALETTE.demon, 0.35),
      yScale: 0.52,
      sizeMul: 1.12,
      emissive: PALETTE.amulet,
      roughness: 0.3,
      metalness: 0.22,
    };
  }
  if (ch === "M") {
    return {
      color: PALETTE.gold,
      yScale: 1.14,
      sizeMul: 1,
      emissive: PALETTE.gold,
      roughness: 0.4,
      metalness: 0.2,
    };
  }
  if (ch === "<" || ch === ">") {
    return {
      color: PALETTE.stairs,
      yScale: 0.78,
      sizeMul: 1,
      emissive: 0,
      roughness: 0.5,
      metalness: 0.16,
    };
  }
  if (ch === "!") {
    return {
      color: PALETTE.potion,
      yScale: 0.85,
      sizeMul: 1,
      emissive: PALETTE.potion,
      roughness: 0.4,
      metalness: 0.12,
    };
  }
  if (ch === ")") {
    return {
      color: PALETTE.weapon,
      yScale: 0.9,
      sizeMul: 1,
      emissive: 0,
      roughness: 0.45,
      metalness: 0.28,
    };
  }
  if (ch === "]") {
    return {
      color: PALETTE.armor,
      yScale: 0.88,
      sizeMul: 1,
      emissive: 0,
      roughness: 0.46,
      metalness: 0.26,
    };
  }
  if (ch === "%") {
    return {
      color: PALETTE.food,
      yScale: 0.7,
      sizeMul: 1,
      emissive: 0,
      roughness: 0.5,
      metalness: 0.08,
    };
  }
  if (ch === "_") {
    return {
      color: PALETTE.look,
      yScale: 0.45,
      sizeMul: 1.2,
      emissive: PALETTE.look,
      roughness: 0.4,
      metalness: 0.1,
    };
  }
  if (ch === "$") {
    return {
      color: PALETTE.gold,
      yScale: 0.65,
      sizeMul: 1,
      emissive: PALETTE.gold,
      roughness: 0.4,
      metalness: 0.3,
    };
  }
  if (ch === "*") {
    return {
      color: PALETTE.amulet,
      yScale: 0.8,
      sizeMul: 1,
      emissive: PALETTE.amulet,
      roughness: 0.35,
      metalness: 0.2,
    };
  }
  if (ch === "@") {
    return {
      color: PALETTE.player,
      yScale: 1.28,
      sizeMul: 1,
      emissive: PALETTE.player,
      roughness: 0.38,
      metalness: 0.12,
    };
  }
  const actor = monsterByGlyph(ch);
  if (actor) return actorTileFromDef(actor);
  if (isLetterWall(ch)) {
    return {
      color: PALETTE.title,
      yScale: 1.18,
      sizeMul: 1,
      emissive: PALETTE.title,
      roughness: 0.46,
      metalness: 0.2,
    };
  }
  return {
    color: PALETTE.floor,
    yScale: 0.7,
    sizeMul: 1,
    emissive: 0,
    roughness: 0.6,
    metalness: 0.08,
  };
}

export function shouldDraw(ch: string): boolean {
  return ch !== " ";
}
