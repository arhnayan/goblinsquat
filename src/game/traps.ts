import { charAt, setTile, type Dungeon } from "./dungeon";
import type { Rng } from "./rng";
import type { StatusKind } from "./status";

export type TrapKind = "spike" | "gas" | "alarm";

export type TrapHit = {
  kind: TrapKind;
  dmg: number;
  status?: StatusKind;
  turns?: number;
  log: string;
  monsterLog: string;
};

export function isTrapTile(ch: string): boolean {
  return ch === "^" || ch === "'" || ch === ":";
}

export function triggerTrap(
  dungeon: Dungeon,
  x: number,
  z: number,
  rng: Rng,
): TrapHit | null {
  const ch = charAt(dungeon, x, z);
  if (!isTrapTile(ch)) return null;
  setTile(dungeon, x, z, ".");
  if (ch === "^") {
    const dmg = rng.range(3, 6);
    return {
      kind: "spike",
      dmg,
      log: "spikes lance you",
      monsterLog: "stumbles into spikes",
    };
  }
  if (ch === ":") {
    return {
      kind: "alarm",
      dmg: 0,
      log: "a ward shrieks",
      monsterLog: "sets off a ward",
    };
  }
  return {
    kind: "gas",
    dmg: 0,
    status: "poison",
    turns: 3,
    log: "a vent coughs poison",
    monsterLog: "chokes on a gas vent",
  };
}
