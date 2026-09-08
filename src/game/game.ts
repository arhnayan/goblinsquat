import type { Font } from "opentype.js";
import type { Scene } from "three";
import {
  charAt,
  FOV_RADIUS,
  isWalkable,
  cellKey,
  setTile,
} from "./dungeon";
import { prefersReducedMotion } from "./anim";
import { buildGlyphWorld, type GlyphWorld } from "./glyphs";
import { createPlayer, type Player } from "./player";
import {
  createActorView,
  disposeActorView,
  retintActor,
  setActorVisible,
  startActorHop,
  startActorLunge,
  updateActorView,
  type ActorView,
} from "./actors";
import { computeFov, hasLos, markSeen } from "./fov";
import { killDrop, rollDamage } from "./combat";
import {
  allocId,
  type Floor,
  type Item,
  type Monster,
} from "./generate";
import { enterPos, getFloor, newRun, type Run } from "./run";
import type { Hud } from "./hud";
import { followIsoCamera } from "./camera";
import type { OrthographicCamera } from "three";

type Occ = { kind: "player" } | { kind: "monster"; id: number };
type Phase = "idle" | "playerAnim" | "enemies" | "over";

export type Game = {
  player: Player;
  update: (dt: number, time: number, camera: OrthographicCamera) => void;
  restart: () => void;
  retint: () => void;
};

export function createGame(
  scene: Scene,
  font: Font,
  hud: Hud,
): Game {
  const reduced = prefersReducedMotion();
  let started = false;
  let run: Run;
  let floor: Floor;
  let world: GlyphWorld;
  let player: Player;
  let monsterViews = new Map<number, ActorView>();
  let itemViews = new Map<number, ActorView>();
  let occ = new Map<string, Occ>();
  let phase: Phase = "idle";
  let visible = new Set<string>();
  let pendingHit: Monster | null = null;
  let floorLock = false;

  const occKey = (x: number, z: number) => cellKey(x, z);

  function monsterAt(x: number, z: number): Monster | null {
    const o = occ.get(occKey(x, z));
    if (!o || o.kind !== "monster") return null;
    return floor.monsters.find((m) => m.id === o.id && m.hp > 0) ?? null;
  }

  function rebuildOcc(): void {
    occ.clear();
    occ.set(occKey(player.gridX, player.gridZ), { kind: "player" });
    for (const m of floor.monsters) {
      if (m.hp <= 0) continue;
      occ.set(occKey(m.x, m.z), { kind: "monster", id: m.id });
    }
  }

  function refreshFov(): void {
    visible = computeFov(
      floor.dungeon,
      player.gridX,
      player.gridZ,
      FOV_RADIUS,
    );
    markSeen(floor.seen, visible, floor.dungeon.width, floor.dungeon.height);
    world.applyFov(visible, floor.seen);
    for (const m of floor.monsters) {
      const v = monsterViews.get(m.id);
      if (!v) continue;
      setActorVisible(v, visible.has(occKey(m.x, m.z)) && m.hp > 0);
    }
    for (const it of floor.items) {
      const v = itemViews.get(it.id);
      if (!v) continue;
      const k = occKey(it.x, it.z);
      setActorVisible(v, visible.has(k) || !!floor.seen[it.z]?.[it.x]);
    }
  }

  function spawnViews(): void {
    for (const m of floor.monsters) {
      if (m.hp <= 0) continue;
      const v = createActorView(font, m.glyph, m.id, m.x, m.z, scene);
      monsterViews.set(m.id, v);
    }
    for (const it of floor.items) {
      const v = createActorView(font, it.glyph, it.id, it.x, it.z, scene);
      itemViews.set(it.id, v);
    }
  }

  function disposeViews(): void {
    for (const v of monsterViews.values()) disposeActorView(v, scene);
    for (const v of itemViews.values()) disposeActorView(v, scene);
    monsterViews.clear();
    itemViews.clear();
  }

  function loadFloor(depth: number, via: "start" | "down" | "up"): void {
    floorLock = true;
    if (world) world.dispose();
    disposeViews();
    run.depth = depth;
    floor = getFloor(run, depth);
    world = buildGlyphWorld(font, floor.dungeon, scene);
    const pos = enterPos(floor, via);
    player.place(pos.x, pos.z);
    rebuildOcc();
    spawnViews();
    refreshFov();
    world.resetBoot(pos.x, pos.z);
    hud.refresh(run);
    phase = "idle";
    floorLock = false;
  }

  function startNew(seed?: number): void {
    if (started) {
      player.dispose(scene);
      world.dispose();
      disposeViews();
    }
    started = true;
    hud.clearLog();
    hud.overlay(null);
    run = newRun(seed);
    floor = run.floors.get(1)!;
    world = buildGlyphWorld(font, floor.dungeon, scene);
    player = createPlayer(font, floor.dungeon.spawn.x, floor.dungeon.spawn.z, scene);
    spawnViews();
    rebuildOcc();
    refreshFov();
    hud.refresh(run);
    hud.log("the squat yawns open");
    phase = "idle";
  }

  function die(): void {
    run.status = "dead";
    phase = "over";
    hud.log("you die");
    hud.overlay(`you die\nseed ${run.seed}\nR restart`);
    hud.refresh(run);
  }

  function win(): void {
    run.status = "won";
    phase = "over";
    hud.log("you escape with the amulet");
    hud.overlay(`you escape with the amulet\nseed ${run.seed}\nR restart`);
    hud.refresh(run);
  }

  function pickupAt(x: number, z: number): void {
    const idx = floor.items.findIndex((i) => i.x === x && i.z === z);
    if (idx < 0) return;
    const it = floor.items[idx]!;
    floor.items.splice(idx, 1);
    const view = itemViews.get(it.id);
    if (view) {
      disposeActorView(view, scene);
      itemViews.delete(it.id);
    }
    if (it.kind === "potion") {
      run.potions += 1;
      hud.log("you pick up a potion");
    } else if (it.kind === "weapon") {
      run.weapon = it.weaponName ?? "shank";
      run.atk = it.weaponAtk ?? 3;
      hud.log(`you wield the ${run.weapon}`);
    } else if (it.kind === "gold") {
      const n = it.gold ?? 5;
      run.gold += n;
      hud.log(`you scoop $${n}`);
    } else if (it.kind === "amulet") {
      run.hasAmulet = true;
      hud.log("the amulet hums in your hand");
    }
    hud.refresh(run);
  }

  function dropAt(x: number, z: number, kind: "gold" | "potion"): void {
    if (!isWalkable(floor.dungeon, x, z)) return;
    if (floor.items.some((i) => i.x === x && i.z === z)) return;
    const it: Item =
      kind === "potion"
        ? { id: allocId(), kind: "potion", glyph: "!", x, z }
        : {
            id: allocId(),
            kind: "gold",
            glyph: "$",
            x,
            z,
            gold: run.rng.range(2, 8),
          };
    floor.items.push(it);
    const v = createActorView(font, it.glyph, it.id, x, z, scene);
    itemViews.set(it.id, v);
    setActorVisible(v, visible.has(occKey(x, z)));
  }

  function hitMonster(m: Monster): void {
    const dmg = rollDamage(run.rng, run.atk, m.def);
    m.hp -= dmg;
    hud.log(`you hit the ${m.name} (${dmg})`);
    if (m.hp <= 0) {
      hud.log(`the ${m.name} dies`);
      occ.delete(occKey(m.x, m.z));
      const v = monsterViews.get(m.id);
      if (v) v.dying = 0;
      const drop = killDrop(run.rng, m);
      if (drop) dropAt(m.x, m.z, drop);
    }
    hud.refresh(run);
  }

  function hitPlayer(m: Monster): void {
    if (run.status !== "play") return;
    const dmg = rollDamage(run.rng, m.atk, run.def);
    run.hp -= dmg;
    hud.log(`the ${m.name} hits you (${dmg})`);
    hud.refresh(run);
    if (run.hp <= 0) die();
  }

  function tryStairs(): boolean {
    const ch = charAt(floor.dungeon, player.gridX, player.gridZ);
    if (ch === ">") {
      hud.log("you descend");
      loadFloor(run.depth + 1, "down");
      return true;
    }
    if (ch === "<") {
      if (run.depth === 1) {
        if (run.hasAmulet) {
          win();
          return true;
        }
        hud.log("the hatch is sealed");
        return false;
      }
      hud.log("you climb");
      loadFloor(run.depth - 1, "up");
      return true;
    }
    return false;
  }

  function beginEnemyTurn(): void {
    if (run.status !== "play") {
      phase = "over";
      return;
    }
    phase = "enemies";
    const claimed = new Set<string>();
    claimed.add(occKey(player.gridX, player.gridZ));
    for (const m of floor.monsters) {
      if (m.hp <= 0) continue;
      claimed.add(occKey(m.x, m.z));
    }

    let any = false;
    for (const m of floor.monsters) {
      if (m.hp <= 0 || run.status !== "play") continue;
      const view = monsterViews.get(m.id);
      if (!view) continue;
      const px = player.gridX;
      const pz = player.gridZ;
      const mdx = px - m.x;
      const mdz = pz - m.z;
      const manh = Math.abs(mdx) + Math.abs(mdz);
      if (manh === 1) {
        startActorLunge(view, Math.sign(mdx), Math.sign(mdz));
        any = true;
        continue;
      }
      const sees =
        visible.has(occKey(m.x, m.z)) &&
        hasLos(floor.dungeon, m.x, m.z, px, pz);
      let nx = m.x;
      let nz = m.z;
      if (sees) {
        if (Math.abs(mdx) >= Math.abs(mdz) && mdx !== 0) nx += Math.sign(mdx);
        else if (mdz !== 0) nz += Math.sign(mdz);
        else nx += Math.sign(mdx);
      } else if (run.rng.chance(0.5)) {
        const dir = run.rng.pick([
          { dx: 1, dz: 0 },
          { dx: -1, dz: 0 },
          { dx: 0, dz: 1 },
          { dx: 0, dz: -1 },
        ]);
        nx = m.x + dir.dx;
        nz = m.z + dir.dz;
      } else continue;

      const dest = occKey(nx, nz);
      if (claimed.has(dest)) continue;
      if (!isWalkable(floor.dungeon, nx, nz)) continue;
      occ.delete(occKey(m.x, m.z));
      occ.set(dest, { kind: "monster", id: m.id });
      claimed.add(dest);
      claimed.delete(occKey(m.x, m.z));
      m.x = nx;
      m.z = nz;
      startActorHop(view, nx, nz);
      any = true;
    }

    if (!any) {
      refreshFov();
      phase = "idle";
    }
  }

  function handleIntent(): void {
    if (phase !== "idle" || run.status !== "play" || player.busy) return;
    const intent = player.consumeIntent();
    if (!intent) return;
    if (intent.type === "restart") return;
    if (intent.type === "wait") {
      hud.log("you wait");
      beginEnemyTurn();
      return;
    }
    if (intent.type === "quaff") {
      if (run.potions <= 0) {
        hud.log("no potions");
        return;
      }
      run.potions -= 1;
      if (run.hp >= run.maxHp) hud.log("the potion does nothing");
      else {
        run.hp = Math.min(run.maxHp, run.hp + 8);
        hud.log("you feel better");
      }
      hud.refresh(run);
      beginEnemyTurn();
      return;
    }
    const nx = player.gridX + intent.dx;
    const nz = player.gridZ + intent.dz;
    const ch = charAt(floor.dungeon, nx, nz);
    const foe = monsterAt(nx, nz);
    if (foe) {
      pendingHit = foe;
      player.startLunge(intent.dx, intent.dz);
      phase = "playerAnim";
      return;
    }
    if (ch === "+") {
      setTile(floor.dungeon, nx, nz, ".");
      world.hideCell(nx, nz);
      world.showFloorAt(nx, nz);
      hud.log("you open the door");
      refreshFov();
      beginEnemyTurn();
      return;
    }
    if (!isWalkable(floor.dungeon, nx, nz)) return;
    if (occ.has(occKey(nx, nz))) return;
    occ.delete(occKey(player.gridX, player.gridZ));
    occ.set(occKey(nx, nz), { kind: "player" });
    player.startHop(nx, nz);
    phase = "playerAnim";
  }

  function enemiesBusy(): boolean {
    for (const v of monsterViews.values()) {
      if (v.hop || v.lunge || v.dying !== null) return true;
    }
    return false;
  }

  startNew();

  const update = (
    dt: number,
    time: number,
    camera: OrthographicCamera,
  ) => {
    if (!floorLock) world.update(time);

    if (run.status !== "play") {
      const intent = player.consumeIntent();
      if (intent?.type === "restart") startNew();
    } else if (phase === "idle") {
      handleIntent();
    }

    const pev = player.update(dt, time, reduced);
    if (phase === "playerAnim") {
      if (pev === "lungeHit" && pendingHit && pendingHit.hp > 0) {
        hitMonster(pendingHit);
        pendingHit = null;
      }
      if (pev === "landed") {
        world.punchFloor(player.gridX, player.gridZ);
        pickupAt(player.gridX, player.gridZ);
        if (!tryStairs()) beginEnemyTurn();
      } else if (pev === "lungeDone") {
        pendingHit = null;
        if (run.status === "play") beginEnemyTurn();
      }
    }

    for (const [id, v] of [...monsterViews.entries()]) {
      const ev = updateActorView(v, dt, time, reduced);
      if (ev === "lungeHit") {
        const m = floor.monsters.find((mm) => mm.id === id);
        if (m && m.hp > 0) hitPlayer(m);
      }
      if (ev === "dead") {
        disposeActorView(v, scene);
        monsterViews.delete(id);
        floor.monsters = floor.monsters.filter((m) => m.id !== id);
      }
    }

    for (const v of itemViews.values()) {
      updateActorView(v, dt, time, reduced);
    }

    if (phase === "enemies" && run.status === "play" && !enemiesBusy()) {
      refreshFov();
      phase = "idle";
    }

    followIsoCamera(camera, player.follow.position, dt);
  };

  const restart = () => startNew();

  const retint = () => {
    world.retint();
    player.retint();
    for (const v of monsterViews.values()) retintActor(v);
    for (const v of itemViews.values()) retintActor(v);
    hud.refresh(run);
  };

  return {
    get player() {
      return player;
    },
    update,
    restart,
    retint,
  };
}
