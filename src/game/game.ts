import type { Font } from "opentype.js";
import type { OrthographicCamera, Scene } from "three";
import {
  charAt,
  FOV_RADIUS,
  isSlowTile,
  isWalkable,
  cellKey,
  setFloorTheme,
  setTile,
  describeTile,
  worldPos,
} from "./dungeon";
import { prefersReducedMotion } from "./anim";
import { buildGlyphWorld, type GlyphWorld } from "./glyphs";
import { createPlayer, dirFromCode, type Player, type PlayerIntent } from "./player";
import {
  createActorView,
  disposeActorView,
  retintActor,
  setActorVisible,
  setActorWeapon,
  startActorDeath,
  startActorHop,
  startActorLunge,
  updateActorView,
  type ActorView,
} from "./actors";
import { computeFov, hasLos, markSeen } from "./fov";
import { killDrop, rollDamage, rollStrike } from "./combat";
import { type Floor, type Item, type Monster } from "./generate";
import {
  aAn,
  letterIndex,
  monsterDef,
  woundedName,
} from "./catalog";
import {
  addToPack,
  countKind,
  equippedAffixes,
  firstOfKind,
  hasTrinketEffect,
  packFull,
  pickupMessage,
  takeFromPack,
  trinketMagnitude,
  usePackItem,
} from "./inventory";
import { isFormTarget } from "./dom";
import {
  canStep,
  chebyshev,
  isAdjacent,
  nextStepAway,
  nextStepToward,
  randomStep,
} from "./path";
import { enterPos, getFloor, newRun, parseSeed, urlSeed, type Run } from "./run";
import { PLAY_HINT, type Hud } from "./hud";
import { followIsoCamera, getHudMotion } from "./camera";
import { formatScores, recordScore, runScore } from "./score";
import {
  applyStatus,
  clearStatus,
  hasAnyStatus,
  tickStatuses,
} from "./status";
import { triggerTrap } from "./traps";
import { canSell, sellPrice } from "./shop";

type Occ = { kind: "player" } | { kind: "monster"; id: number };
type Phase = "idle" | "playerAnim" | "enemies" | "over";
type Mode = "title" | "play" | "look" | "inventory" | "shop" | "help" | "over";

export type Game = {
  player: Player;
  update: (dt: number, time: number, camera: OrthographicCamera) => void;
  restart: () => void;
  retint: () => void;
};

export function createGame(scene: Scene, font: Font, hud: Hud): Game {
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
  let mode: Mode = "title";
  let helpFrom: Mode = "title";
  let endText = "";
  let seedBuf = "";
  let visible = new Set<string>();
  let pendingHit: Monster | null = null;
  let floorLock = false;
  let resting = false;
  let lookX = 0;
  let lookZ = 0;
  let lookView: ActorView | null = null;
  let restDelay = 0;
  let seedTyped = false;
  let extraEnemyTurns = 0;

  const occKey = (x: number, z: number) => cellKey(x, z);

  function syncInput(): void {
    player.setEnabled(mode === "play" && phase === "idle");
  }

  function monsterAt(x: number, z: number): Monster | null {
    const o = occ.get(occKey(x, z));
    if (!o || o.kind !== "monster") return null;
    return floor.monsters.find((m) => m.id === o.id && m.hp > 0) ?? null;
  }

  function itemAt(x: number, z: number): Item | null {
    return floor.items.find((i) => i.x === x && i.z === z) ?? null;
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
    visible = computeFov(floor.dungeon, player.gridX, player.gridZ, FOV_RADIUS);
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
    if (mode === "look") refreshLook();
  }

  function spawnViews(): void {
    for (const m of floor.monsters) {
      if (m.hp <= 0) continue;
      const v = createActorView(font, m.glyph, m.id, m.x, m.z, scene);
      retintActor(v, m.elite);
      setActorWeapon(v, monsterDef(m.kind).wieldsVisualType, m.elite ? "fine" : undefined);
      monsterViews.set(m.id, v);
    }
    for (const it of floor.items) {
      const v = createActorView(font, it.glyph, it.id, it.x, it.z, scene);
      itemViews.set(it.id, v);
    }
  }

  function disposeViews(): void {
    closeLook();
    for (const v of monsterViews.values()) disposeActorView(v, scene);
    for (const v of itemViews.values()) disposeActorView(v, scene);
    monsterViews.clear();
    itemViews.clear();
  }

  function loadFloor(depth: number, via: "start" | "down" | "up"): void {
    floorLock = true;
    resting = false;
    extraEnemyTurns = 0;
    if (world) world.dispose();
    disposeViews();
    run.depth = depth;
    floor = getFloor(run, depth);
    setFloorTheme(floor.themeId);
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
    syncInput();
  }

  function showTitle(): void {
    mode = "title";
    resting = false;
    seedTyped = false;
    closeLook();
    hud.hidePack();
    seedBuf = String(run.seed);
    hud.showTitle(seedBuf);
    player.setEnabled(false);
  }

  function enterPlay(): void {
    mode = "play";
    hud.overlay(null);
    hud.hidePack();
    hud.setLook(null);
    hud.setHint(PLAY_HINT);
    syncInput();
  }

  function startNew(seed?: number, playing = true): void {
    if (started) {
      player.dispose(scene);
      world.dispose();
      disposeViews();
    }
    started = true;
    hud.clearLog();
    hud.overlay(null);
    hud.hidePack();
    hud.setLook(null);
    run = newRun(seed);
    floor = run.floors.get(1)!;
    setFloorTheme(floor.themeId);
    world = buildGlyphWorld(font, floor.dungeon, scene);
    player = createPlayer(font, floor.dungeon.spawn.x, floor.dungeon.spawn.z, scene);
    syncPlayerGear();
    spawnViews();
    rebuildOcc();
    refreshFov();
    hud.refresh(run);
    phase = "idle";
    if (playing) {
      hud.log("the squat yawns open");
      enterPlay();
    } else {
      showTitle();
    }
  }

  function finishOverlay(kind: "dead" | "won"): string {
    const scores = recordScore(run);
    const title = kind === "won" ? "you escape with the amulet" : "you die";
    const board = formatScores(scores);
    return `${title}\nseed ${run.seed}  score ${runScore(run)}${board ? `\n\n${board}` : ""}\n\nR title`;
  }

  function die(): void {
    run.status = "dead";
    phase = "over";
    mode = "over";
    resting = false;
    hud.log("you die");
    endText = finishOverlay("dead");
    hud.overlay(endText);
    hud.refresh(run);
    player.setEnabled(false);
  }

  function win(): void {
    run.status = "won";
    phase = "over";
    mode = "over";
    resting = false;
    hud.log("you escape with the amulet");
    endText = finishOverlay("won");
    hud.overlay(endText);
    hud.refresh(run);
    player.setEnabled(false);
  }

  function handleLethalCheck(): boolean {
    if (run.hp > 0) return false;
    if (hasTrinketEffect(run, "undying") && !run.usedRevive) {
      run.usedRevive = true;
      run.hp = 1;
      hud.log("the charm shatters, sparing you");
      hud.refresh(run);
      return false;
    }
    die();
    return true;
  }

  function gainGold(amount: number): void {
    run.gold += Math.round(amount * (1 + trinketMagnitude(run, "hoarder")));
  }

  function syncPlayerGear(): void {
    const weapon = run.pack.find((i) => i.id === run.weaponId) ?? null;
    player.setWeapon(weapon);
    player.setNightlight(hasTrinketEffect(run, "nightlight"));
  }

  function spendTurn(): boolean {
    if (run.status !== "play") return false;
    run.turns += 1;
    const logs = tickStatuses(run);
    for (const msg of logs) hud.log(msg);
    let changed = logs.length > 0;
    if (hasTrinketEffect(run, "mend") && run.hp < run.maxHp) {
      const interval = Math.max(1, Math.round(trinketMagnitude(run, "mend")));
      if (run.turns % interval === 0) {
        run.hp = Math.min(run.maxHp, run.hp + 1);
        hud.log("the charm knits your wounds");
        changed = true;
      }
    }
    if (changed) hud.refresh(run);
    if (handleLethalCheck()) return false;
    return true;
  }

  function foeInView(): boolean {
    return floor.monsters.some(
      (m) => m.hp > 0 && visible.has(occKey(m.x, m.z)),
    );
  }

  function pickupAt(x: number, z: number): void {
    const idx = floor.items.findIndex((i) => i.x === x && i.z === z);
    if (idx < 0) return;
    const it = floor.items[idx]!;
    if (it.kind === "gold") {
      floor.items.splice(idx, 1);
      detachItem(it);
      gainGold(it.gold ?? 5);
      hud.log(pickupMessage(it));
      hud.refresh(run);
      return;
    }
    if (it.kind === "amulet") {
      floor.items.splice(idx, 1);
      detachItem(it);
      run.hasAmulet = true;
      hud.log(pickupMessage(it));
      hud.refresh(run);
      return;
    }
    if (packFull(run)) {
      hud.log("your pack is full");
      return;
    }
    floor.items.splice(idx, 1);
    detachItem(it);
    addToPack(run, it);
    hud.log(pickupMessage(it));
    hud.refresh(run);
  }

  function detachItem(it: Item): void {
    const view = itemViews.get(it.id);
    if (view) {
      disposeActorView(view, scene);
      itemViews.delete(it.id);
    }
  }

  function placeItem(it: Item, x: number, z: number): boolean {
    if (!isWalkable(floor.dungeon, x, z)) return false;
    if (itemAt(x, z)) return false;
    it.x = x;
    it.z = z;
    floor.items.push(it);
    const v = createActorView(font, it.glyph, it.id, x, z, scene);
    itemViews.set(it.id, v);
    setActorVisible(v, visible.has(occKey(x, z)) || !!floor.seen[z]?.[x]);
    return true;
  }

  function dropSpot(x: number, z: number): { x: number; z: number } | null {
    if (isWalkable(floor.dungeon, x, z) && !itemAt(x, z) && !monsterAt(x, z)) {
      return { x, z };
    }
    const dirs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];
    for (const d of dirs) {
      const nx = x + d.x;
      const nz = z + d.z;
      if (
        isWalkable(floor.dungeon, nx, nz) &&
        !itemAt(nx, nz) &&
        !monsterAt(nx, nz) &&
        !(nx === player.gridX && nz === player.gridZ)
      ) {
        return { x: nx, z: nz };
      }
    }
    return null;
  }

  function underfoot(): void {
    const ch = charAt(floor.dungeon, player.gridX, player.gridZ);
    if (ch === ">") hud.log("a staircase down. press > to descend");
    else if (ch === "<") {
      if (run.depth === 1) {
        hud.log(
          run.hasAmulet
            ? "the hatch. press < to escape"
            : "the hatch is sealed",
        );
      } else hud.log("a staircase up. press < to climb");
    }
    if (merchantBeside()) hud.log("a merchant. press enter to trade");
  }

  function merchantBeside(): boolean {
    const dirs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];
    for (const d of dirs) {
      if (charAt(floor.dungeon, player.gridX + d.x, player.gridZ + d.z) === "M") {
        return true;
      }
    }
    return false;
  }

  function killMonster(m: Monster, explode: boolean, dx = 0, dz = 0): void {
    hud.log(explode ? `the ${m.name} shatters` : `the ${m.name} dies`);
    occ.delete(occKey(m.x, m.z));
    const v = monsterViews.get(m.id);
    if (v) startActorDeath(v, scene, explode, dx, dz, reduced);
    if (explode) world.punchFloor(m.x, m.z);
    const drop = killDrop(run.rng, m, floor.depth, monsterDef(m.kind));
    if (drop) placeItem(drop, m.x, m.z);
  }

  function hitMonster(m: Monster): void {
    const full = m.hp >= m.maxHp;
    const affixes = equippedAffixes(run, "weapon");
    const critBonus = (affixes.includes("keen") ? 0.08 : 0) + trinketMagnitude(run, "keeneye");
    const strike = rollStrike(run.rng, run.atk, m.def, critBonus);
    m.hp -= strike.dmg;
    m.awake = true;
    hud.log(
      strike.crit
        ? `you crit the ${woundedName(m)} (${strike.dmg})`
        : `you hit the ${woundedName(m)} (${strike.dmg})`,
    );
    if (affixes.includes("vampiric")) {
      const drain = Math.max(1, Math.round(strike.dmg * 0.2));
      if (run.hp < run.maxHp) {
        run.hp = Math.min(run.maxHp, run.hp + drain);
        hud.log(`you drain ${drain} hp`);
      }
    }
    if (m.hp <= 0) {
      const explode = full || strike.crit;
      killMonster(m, explode, player.lunge?.dx ?? 0, player.lunge?.dz ?? 0);
    }
    hud.refresh(run);
  }

  function hitPlayer(m: Monster): void {
    if (run.status !== "play") return;
    const def = monsterDef(m.kind);
    const armorAffixes = equippedAffixes(run, "armor");
    const dmg = rollDamage(run.rng, m.atk, run.def);
    run.hp -= dmg;
    hud.log(`the ${m.name} hits you (${dmg})`);
    if (armorAffixes.includes("thorned") && m.hp > 0) {
      const reflect = run.rng.int(2) + 1;
      m.hp -= reflect;
      hud.log("your armor bites back");
      if (m.hp <= 0) killMonster(m, false);
    }
    const warded = armorAffixes.includes("wardStatus");
    if (def.poison && !(warded && run.rng.chance(0.25))) {
      const msg = applyStatus(run, "poison");
      if (msg) hud.log(msg);
    } else if (def.poison) {
      hud.log("your ward resists it");
    }
    if (def.bleed && !(warded && run.rng.chance(0.25))) {
      const msg = applyStatus(run, "bleed");
      if (msg) hud.log(msg);
    } else if (def.bleed) {
      hud.log("your ward resists it");
    }
    if (def.burns && !(warded && run.rng.chance(0.25))) {
      const msg = applyStatus(run, "burn");
      if (msg) hud.log(msg);
    } else if (def.burns) {
      hud.log("your ward resists it");
    }
    hud.refresh(run);
    handleLethalCheck();
  }

  function useStairs(dir: "up" | "down"): void {
    if (mode !== "play" || phase !== "idle" || run.status !== "play") return;
    cancelRest(true);
    const ch = charAt(floor.dungeon, player.gridX, player.gridZ);
    if (dir === "down") {
      if (ch !== ">") {
        hud.log("no stairs down here");
        return;
      }
      hud.log("you descend");
      loadFloor(run.depth + 1, "down");
      return;
    }
    if (ch !== "<") {
      hud.log("no stairs up here");
      return;
    }
    if (run.depth === 1) {
      if (run.hasAmulet) {
        win();
        return;
      }
      hud.log("the hatch is sealed");
      return;
    }
    hud.log("you climb");
    loadFloor(run.depth - 1, "up");
  }

  function tryUseFirst(kind: "potion" | "food"): void {
    if (mode !== "play" || phase !== "idle" || run.status !== "play") return;
    cancelRest(true);
    const n = countKind(run, kind);
    if (n <= 0) {
      hud.log(kind === "potion" ? "no potions" : "no rations");
      return;
    }
    if (n > 1) {
      openInventory();
      return;
    }
    const idx = firstOfKind(run, kind);
    applyPack(idx);
  }

  function applyPack(index: number): void {
    if (run.status !== "play" || phase !== "idle") return;
    const before = run.pack[index];
    if (!before) {
      hud.log("nothing there");
      return;
    }
    const msg = usePackItem(run, index);
    syncPlayerGear();
    hud.log(msg);
    hud.refresh(run);
    closeInventory();
    if (!spendTurn()) return;
    beginEnemyTurn();
  }

  function dropPack(index: number): void {
    if (run.status !== "play" || phase !== "idle") return;
    const it = run.pack[index];
    if (!it) {
      hud.log("nothing there");
      return;
    }
    const spot = dropSpot(player.gridX, player.gridZ);
    if (!spot) {
      hud.log("no room to drop");
      return;
    }
    takeFromPack(run, index);
    syncPlayerGear();
    placeItem(it, spot.x, spot.z);
    hud.log(`you drop ${aAn(it.name)}`);
    hud.refresh(run);
    closeInventory();
    if (!spendTurn()) return;
    beginEnemyTurn();
  }

  function openInventory(): void {
    if (run.status !== "play" || phase !== "idle") return;
    cancelRest(true);
    mode = "inventory";
    hud.showPack(run);
    player.setEnabled(false);
  }

  function closeInventory(): void {
    if (mode !== "inventory") {
      if (mode !== "shop") hud.hidePack();
      return;
    }
    mode = "play";
    hud.hidePack();
    hud.setHint(PLAY_HINT);
    syncInput();
  }

  function openShop(): void {
    if (mode !== "play" || phase !== "idle" || run.status !== "play") return;
    if (!merchantBeside()) return;
    if (!floor.shop) {
      hud.log("the stall is empty");
      return;
    }
    cancelRest(true);
    mode = "shop";
    hud.showShop(run, floor.shop);
    player.setEnabled(false);
  }

  function closeShop(silent = false): void {
    if (mode !== "shop") return;
    mode = "play";
    hud.hidePack();
    hud.setHint(PLAY_HINT);
    if (!silent) hud.log("you step back from the stall");
    syncInput();
  }

  function buyOffer(index: number): void {
    if (mode !== "shop" || phase !== "idle" || run.status !== "play") return;
    const shop = floor.shop;
    if (!shop) return;
    const offer = shop.offers[index];
    if (!offer) {
      hud.log("nothing there");
      return;
    }
    if (run.gold < offer.price) {
      hud.log("not enough gold");
      return;
    }
    if (packFull(run)) {
      hud.log("your pack is full");
      return;
    }
    run.gold -= offer.price;
    shop.offers.splice(index, 1);
    addToPack(run, offer.item);
    hud.log(`you buy ${aAn(offer.item.name)} for $${offer.price}`);
    hud.showShop(run, shop);
    hud.refresh(run);
    if (!spendTurn()) return;
    beginEnemyTurn();
  }

  function sellOffer(index: number): void {
    if (mode !== "shop" || phase !== "idle" || run.status !== "play") return;
    const shop = floor.shop;
    if (!shop) return;
    const it = run.pack[index];
    if (!it) {
      hud.log("nothing there");
      return;
    }
    if (!canSell(it)) {
      hud.log("they will not buy that");
      return;
    }
    const price = sellPrice(it);
    takeFromPack(run, index);
    syncPlayerGear();
    gainGold(price);
    hud.log(`you sell ${aAn(it.name)} for $${price}`);
    hud.showShop(run, shop);
    hud.refresh(run);
    if (!spendTurn()) return;
    beginEnemyTurn();
  }

  function lookDescribe(x: number, z: number): string {
    const seen = !!floor.seen[z]?.[x];
    const vis = visible.has(occKey(x, z));
    if (!seen && !vis) return "unseen";
    const mem = vis ? "" : "you remember ";
    if (vis && x === player.gridX && z === player.gridZ) {
      const it = itemAt(x, z);
      const tile = describeTile(charAt(floor.dungeon, x, z));
      const extra = it ? `, ${aAn(it.name)}` : "";
      return `you (${tile}${extra})`;
    }
    if (vis) {
      const m = monsterAt(x, z);
      if (m) return `${mem}${aAn(woundedName(m))}`;
    }
    const it = itemAt(x, z);
    if (it && (vis || seen)) return `${mem}${aAn(it.name)}`;
    return `${mem}${describeTile(charAt(floor.dungeon, x, z))}`;
  }

  function refreshLook(): void {
    if (!lookView) return;
    lookView.gridX = lookX;
    lookView.gridZ = lookZ;
    const pos = worldPos(lookX, lookZ);
    lookView.root.position.set(pos.x, 0.12, pos.z);
    hud.setLook(lookDescribe(lookX, lookZ));
  }

  function openLook(): void {
    if (run.status !== "play" || phase !== "idle") return;
    cancelRest(true);
    mode = "look";
    lookX = player.gridX;
    lookZ = player.gridZ;
    lookView = createActorView(font, "_", -1, lookX, lookZ, scene);
    refreshLook();
    player.setEnabled(false);
  }

  function closeLook(): void {
    if (lookView) {
      disposeActorView(lookView, scene);
      lookView = null;
    }
    hud.setLook(null);
    if (mode === "look") {
      mode = "play";
      hud.setHint(PLAY_HINT);
      syncInput();
    }
  }

  function moveLook(dx: number, dz: number): void {
    const nx = Math.max(0, Math.min(floor.dungeon.width - 1, lookX + dx));
    const nz = Math.max(0, Math.min(floor.dungeon.height - 1, lookZ + dz));
    lookX = nx;
    lookZ = nz;
    refreshLook();
  }

  function openHelp(): void {
    helpFrom = mode;
    if (mode === "look") {
      /* keep cursor */
    } else {
      cancelRest(true);
    }
    if (mode === "inventory" || mode === "shop") hud.hidePack();
    else closeInventory();
    mode = "help";
    hud.showHelp();
    player.setEnabled(false);
  }

  function closeHelp(): void {
    if (helpFrom === "title") {
      mode = "title";
      hud.showTitle(seedBuf);
      player.setEnabled(false);
      return;
    }
    if (helpFrom === "over") {
      mode = "over";
      hud.overlay(endText);
      player.setEnabled(false);
      return;
    }
    if (helpFrom === "inventory") {
      mode = "inventory";
      hud.overlay(null);
      hud.showPack(run);
      player.setEnabled(false);
      return;
    }
    if (helpFrom === "shop") {
      mode = "shop";
      hud.overlay(null);
      if (floor.shop) hud.showShop(run, floor.shop);
      player.setEnabled(false);
      return;
    }
    if (helpFrom === "look") {
      mode = "look";
      hud.overlay(null);
      refreshLook();
      player.setEnabled(false);
      return;
    }
    mode = "play";
    hud.overlay(null);
    hud.setHint(PLAY_HINT);
    syncInput();
  }

  function startRest(): void {
    if (mode !== "play" || phase !== "idle" || run.status !== "play") return;
    if (run.hp >= run.maxHp && !hasAnyStatus(run)) {
      hud.log("you don't need to rest");
      return;
    }
    if (foeInView()) {
      hud.log("you cannot rest now");
      return;
    }
    resting = true;
    restDelay = 0;
    player.clearIntents();
    hud.log("you rest");
  }

  function cancelRest(silent = false): void {
    if (!resting) return;
    resting = false;
    if (!silent) hud.log("you stop resting");
  }

  function doRestTick(): void {
    if (!resting || phase !== "idle" || run.status !== "play") return;
    if (foeInView()) {
      resting = false;
      hud.log("you are interrupted");
      syncInput();
      return;
    }
    if (run.hp >= run.maxHp && !hasAnyStatus(run)) {
      resting = false;
      hud.log("you feel rested");
      syncInput();
      return;
    }
    restDelay = 0.2;
    if (!spendTurn()) return;
    if (run.hp < run.maxHp) run.hp += 1;
    hud.refresh(run);
    beginEnemyTurn();
  }

  function openDoor(nx: number, nz: number): void {
    setTile(floor.dungeon, nx, nz, ".");
    world.hideCell(nx, nz);
    world.showFloorAt(nx, nz);
  }

  const PACK_ALERT_RADIUS = 6;
  const ALARM_RADIUS = 9;

  function alertAll(x: number, z: number, radius: number): void {
    let alerted = 0;
    for (const m of floor.monsters) {
      if (m.hp <= 0 || m.awake) continue;
      if (chebyshev(m.x, m.z, x, z) > radius) continue;
      m.awake = true;
      alerted += 1;
    }
    if (alerted > 0) hud.log("nearby monsters stir");
  }

  function alertPack(source: Monster): void {
    let alerted = 0;
    for (const other of floor.monsters) {
      if (other.id === source.id || other.hp <= 0 || other.awake) continue;
      if (other.kind !== source.kind) continue;
      if (chebyshev(other.x, other.z, source.x, source.z) > PACK_ALERT_RADIUS) continue;
      other.awake = true;
      alerted += 1;
    }
    if (alerted > 0) hud.log(`the ${source.name}s call to each other`);
  }

  function beginEnemyTurn(): void {
    if (run.status !== "play") {
      phase = "over";
      return;
    }
    phase = "enemies";
    player.setEnabled(false);
    refreshFov();
    const claimed = new Set<string>();
    claimed.add(occKey(player.gridX, player.gridZ));
    for (const m of floor.monsters) {
      if (m.hp <= 0) continue;
      claimed.add(occKey(m.x, m.z));
    }

    const px = player.gridX;
    const pz = player.gridZ;
    let any = false;

    for (const m of floor.monsters) {
      if (m.hp <= 0 || run.status !== "play") continue;
      const view = monsterViews.get(m.id);
      if (!view) continue;
      const def = monsterDef(m.kind);
      const sees = visible.has(occKey(m.x, m.z));
      if (!m.awake) {
        if (sees) {
          m.awake = true;
          hud.log(`the ${m.name} notices you`);
          if (def.packAlert || m.elite) alertPack(m);
        } else continue;
      }

      const blocked = new Set(claimed);
      blocked.delete(occKey(m.x, m.z));
      const opts = { doors: def.canOpenDoors, diagonal: true };
      const adj = isAdjacent(m.x, m.z, px, pz);

      if (adj && def.steals && run.gold > 0 && !m.fleeing) {
        const n = Math.min(run.gold, run.rng.range(2, 8));
        run.gold -= n;
        m.fleeing = true;
        hud.log(`the ${m.name} steals $${n}`);
        hud.refresh(run);
        any = true;
        continue;
      }

      const shouldFlee = m.fleeing || (def.flees && m.hp <= m.maxHp * 0.3);
      if (adj && !shouldFlee && !(def.erratic && run.rng.chance(0.5))) {
        startActorLunge(view, Math.sign(px - m.x), Math.sign(pz - m.z));
        any = true;
        continue;
      }

      const dist = chebyshev(m.x, m.z, px, pz);
      if (
        def.ranged &&
        !adj &&
        !shouldFlee &&
        dist <= def.range &&
        hasLos(floor.dungeon, m.x, m.z, px, pz) &&
        !(def.erratic && run.rng.chance(0.5))
      ) {
        startActorLunge(view, Math.sign(px - m.x), Math.sign(pz - m.z));
        any = true;
        continue;
      }

      let step = shouldFlee
        ? nextStepAway(floor.dungeon, m.x, m.z, px, pz, blocked, opts)
        : def.erratic && run.rng.chance(0.5)
          ? randomStep(floor.dungeon, m.x, m.z, blocked, opts, run.rng.pick)
          : nextStepToward(floor.dungeon, m.x, m.z, px, pz, blocked, opts);

      if (!step && !shouldFlee && run.rng.chance(0.5)) {
        step = randomStep(floor.dungeon, m.x, m.z, blocked, opts, run.rng.pick);
      }
      if (!step) continue;

      const destCh = charAt(floor.dungeon, step.x, step.z);
      if (destCh === "+") {
        if (!def.canOpenDoors) continue;
        openDoor(step.x, step.z);
        hud.log(`the ${m.name} opens a door`);
        any = true;
        continue;
      }

      const dest = occKey(step.x, step.z);
      if (claimed.has(dest)) continue;
      if (!isWalkable(floor.dungeon, step.x, step.z)) continue;
      occ.delete(occKey(m.x, m.z));
      occ.set(dest, { kind: "monster", id: m.id });
      claimed.add(dest);
      claimed.delete(occKey(m.x, m.z));
      m.x = step.x;
      m.z = step.z;
      startActorHop(view, step.x, step.z);
      any = true;
    }

    if (!any) finishEnemyTurn();
  }

  function finishEnemyTurn(): void {
    refreshFov();
    if (extraEnemyTurns > 0 && run.status === "play") {
      extraEnemyTurns -= 1;
      if (!spendTurn()) return;
      beginEnemyTurn();
      return;
    }
    phase = "idle";
    if (mode === "play" && run.status === "play") player.setEnabled(true);
  }

  function handleMoveOrWait(intent: PlayerIntent): void {
    if (phase !== "idle" || run.status !== "play" || player.busy) return;
    if (intent.type === "wait") {
      hud.log("you wait");
      if (!spendTurn()) return;
      beginEnemyTurn();
      return;
    }
    const nx = player.gridX + intent.dx;
    const nz = player.gridZ + intent.dz;
    const ch = charAt(floor.dungeon, nx, nz);
    const foe = monsterAt(nx, nz);
    if (intent.type === "thrust") {
      if (!spendTurn()) return;
      pendingHit = foe;
      player.startLunge(intent.dx, intent.dz);
      phase = "playerAnim";
      player.setEnabled(false);
      if (!foe) hud.log("you thrust at air");
      return;
    }
    if (foe) {
      if (!spendTurn()) return;
      pendingHit = foe;
      player.startLunge(intent.dx, intent.dz);
      phase = "playerAnim";
      player.setEnabled(false);
      return;
    }
    if (ch === "+") {
      if (!spendTurn()) return;
      openDoor(nx, nz);
      hud.log("you open the door");
      refreshFov();
      beginEnemyTurn();
      return;
    }
    if (!canStep(floor.dungeon, player.gridX, player.gridZ, nx, nz)) return;
    if (occ.has(occKey(nx, nz))) return;
    if (!spendTurn()) return;
    if (isSlowTile(ch)) extraEnemyTurns += 1;
    occ.delete(occKey(player.gridX, player.gridZ));
    occ.set(occKey(nx, nz), { kind: "player" });
    player.startHop(nx, nz);
    phase = "playerAnim";
    player.setEnabled(false);
  }

  function afterPlayerLand(): void {
    const x = player.gridX;
    const z = player.gridZ;
    const ch = charAt(floor.dungeon, x, z);
    const trap = triggerTrap(floor.dungeon, x, z, run.rng);
    if (trap) {
      world.punchFloor(x, z);
      run.hp -= hasTrinketEffect(run, "stalwart") ? 0 : trap.dmg;
      hud.log(trap.log);
      if (trap.status) {
        const msg = applyStatus(run, trap.status, trap.turns);
        if (msg) hud.log(msg);
      }
      if (trap.kind === "alarm") alertAll(x, z, ALARM_RADIUS);
    } else if (ch === "=") {
      run.hp -= 1;
      hud.log("embers sear you");
      const msg = applyStatus(run, "burn");
      if (msg) hud.log(msg);
    } else if (ch === "~") {
      hud.log("you wade through water");
      if (clearStatus(run, "burn")) hud.log("the water douses the fire");
    } else if (ch === '"') {
      hud.log("you scramble over rubble");
    }
    hud.refresh(run);
    handleLethalCheck();
  }

  function hurtMonsterOnTile(m: Monster): void {
    if (m.hp <= 0) return;
    const ch = charAt(floor.dungeon, m.x, m.z);
    const trap = triggerTrap(floor.dungeon, m.x, m.z, run.rng);
    let dmg = 0;
    if (trap) {
      dmg = trap.kind === "gas" ? 2 : trap.dmg;
      hud.log(`the ${m.name} ${trap.monsterLog}`);
    } else if (ch === "=") {
      dmg = 1;
    }
    if (dmg <= 0) return;
    m.hp -= dmg;
    if (m.hp <= 0) killMonster(m, false);
  }

  function handlePlayIntent(): void {
    if (phase !== "idle" || run.status !== "play" || player.busy) return;
    if (resting) {
      const intent = player.consumeIntent();
      if (intent) {
        cancelRest();
        handleMoveOrWait(intent);
      }
      return;
    }
    const intent = player.consumeIntent();
    if (!intent) return;
    handleMoveOrWait(intent);
  }

  function enemiesBusy(): boolean {
    for (const v of monsterViews.values()) {
      if (v.hop || v.lunge) return true;
    }
    return false;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.code === "KeyF" || e.code === "KeyC") return;
    if (isFormTarget(e.target)) return;

    if (mode === "title") {
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        const seed = parseSeed(seedBuf);
        startNew(seed ?? undefined, true);
        return;
      }
      if (e.code === "Backspace") {
        e.preventDefault();
        seedBuf = seedBuf.slice(0, -1);
        hud.showTitle(seedBuf);
        return;
      }
      const dig = e.code.match(/^Digit(\d)$/) || e.code.match(/^Numpad(\d)$/);
      if (dig) {
        e.preventDefault();
        if (!seedTyped) {
          seedBuf = "";
          seedTyped = true;
        }
        if (seedBuf.length >= 10) return;
        seedBuf += dig[1]!;
        hud.showTitle(seedBuf);
      }
      return;
    }

    if (mode === "help") {
      if (
        e.code === "Escape" ||
        e.key === "?" ||
        (e.code === "Slash" && e.shiftKey) ||
        e.code === "KeyX"
      ) {
        e.preventDefault();
        closeHelp();
      }
      return;
    }

    if (mode === "over") {
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }
      if (e.code === "KeyR" || e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        seedBuf = String(run.seed);
        startNew(run.seed, false);
        showTitle();
      }
      return;
    }

    if (mode === "shop") {
      if (e.code === "Escape" || e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        closeShop();
        return;
      }
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }
      const idx = letterIndex(e.code);
      if (idx === null) return;
      e.preventDefault();
      if (e.shiftKey) sellOffer(idx);
      else buyOffer(idx);
      return;
    }

    if (mode === "inventory") {
      if (e.code === "KeyI" || e.code === "Escape") {
        e.preventDefault();
        closeInventory();
        return;
      }
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }
      const idx = letterIndex(e.code);
      if (idx === null) return;
      e.preventDefault();
      if (e.shiftKey) dropPack(idx);
      else applyPack(idx);
      return;
    }

    if (mode === "look") {
      if (e.code === "KeyX" || e.code === "Escape") {
        e.preventDefault();
        closeLook();
        return;
      }
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }
      const d = dirFromCode(e.code);
      if (d) {
        e.preventDefault();
        moveLook(d.dx, d.dz);
      }
      return;
    }

    if (mode !== "play" || run.status !== "play") return;
    if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
      e.preventDefault();
      openHelp();
      return;
    }
    if (e.code === "KeyR") {
      e.preventDefault();
      startNew(run.seed, false);
      showTitle();
      return;
    }
    if (phase !== "idle" || player.busy) return;
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      openShop();
      return;
    }
    if (e.code === "KeyI") {
      e.preventDefault();
      openInventory();
      return;
    }
    if (e.code === "KeyX") {
      e.preventDefault();
      openLook();
      return;
    }
    if (e.code === "KeyQ") {
      e.preventDefault();
      tryUseFirst("potion");
      return;
    }
    if (e.code === "KeyE") {
      e.preventDefault();
      tryUseFirst("food");
      return;
    }
    if (e.code === "KeyZ" || e.code === "Digit5" || e.code === "Numpad5") {
      e.preventDefault();
      startRest();
      return;
    }
    if (e.code === "Period" && e.shiftKey) {
      e.preventDefault();
      useStairs("down");
      return;
    }
    if (e.code === "Comma" && e.shiftKey) {
      e.preventDefault();
      useStairs("up");
      return;
    }
  }

  hud.bind({
    onStart: (seed) => {
      if (mode !== "title") return;
      seedBuf = seed;
      startNew(parseSeed(seed) ?? undefined, true);
    },
    onHelp: () => {
      if (mode === "play" || mode === "title" || mode === "over" || mode === "inventory" || mode === "look" || mode === "shop") {
        openHelp();
      }
    },
    onSeedChange: (seed) => {
      seedBuf = seed;
      seedTyped = true;
    },
    onPackUse: applyPack,
    onPackDrop: dropPack,
    onShopBuy: buyOffer,
    onShopSell: sellOffer,
  });

  window.addEventListener("keydown", onKey);

  const bootSeed = urlSeed();
  if (bootSeed !== null) startNew(bootSeed, true);
  else startNew(undefined, false);

  const update = (dt: number, time: number, camera: OrthographicCamera) => {
    if (!floorLock && world) world.update(time);

    if (mode === "play" && run.status === "play" && phase === "idle") {
      handlePlayIntent();
      if (resting && phase === "idle") {
        restDelay -= dt;
        if (restDelay <= 0) doRestTick();
      }
    }

    const pev = player.update(dt, time, reduced);
    if (phase === "playerAnim") {
      if (pev === "lungeHit" && pendingHit && pendingHit.hp > 0) {
        hitMonster(pendingHit);
        pendingHit = null;
      }
      if (pev === "landed") {
        world.punchFloor(player.gridX, player.gridZ);
        afterPlayerLand();
        if (run.status === "play") {
          pickupAt(player.gridX, player.gridZ);
          underfoot();
          beginEnemyTurn();
        }
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
      if (ev === "landed") {
        const m = floor.monsters.find((mm) => mm.id === id);
        if (m && m.hp > 0) hurtMonsterOnTile(m);
      }
      if (ev === "dead") {
        disposeActorView(v, scene);
        monsterViews.delete(id);
        floor.monsters = floor.monsters.filter((m) => m.id !== id);
      }
    }

    if (lookView) updateActorView(lookView, dt, time, reduced);

    for (const v of itemViews.values()) {
      updateActorView(v, dt, time, reduced);
    }

    if (phase === "enemies" && run.status === "play" && !enemiesBusy()) {
      finishEnemyTurn();
    }

    followIsoCamera(camera, player.follow.position, dt);
    hud.updateMotion(time, getHudMotion(), reduced);
  };

  const restart = () => startNew(undefined, false);

  const retint = () => {
    world.retint();
    player.retint();
    for (const m of floor.monsters) {
      const v = monsterViews.get(m.id);
      if (v) retintActor(v, m.elite);
    }
    for (const v of itemViews.values()) retintActor(v);
    if (lookView) retintActor(lookView);
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
