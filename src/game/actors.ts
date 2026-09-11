import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Scene,
} from "three";
import type { Font } from "opentype.js";
import { tileStyle, worldPos } from "./dungeon";
import { getColors } from "./theme";
import {
  applyHopPose,
  applyIdlePose,
  applyLungePose,
  FACE_YAW,
  HOP_DURATION,
  type Hop,
  type HopRig,
  LUNGE_DURATION,
  SETTLE_DURATION,
  snapRig,
  volumeScaleXZ,
} from "./anim";
import { makeFitScale, makeGlyphGeometry } from "./glyphs";
import {
  burstGlyphDust,
  disposeDustBurst,
  updateDustBurst,
  type DustBurst,
} from "./dust";
import type { ItemRarity, WeaponVisualType } from "./catalog";
import { buildWeaponVisual, retintWeaponVisual, type WeaponVisual } from "./weapons";

export type ActorView = HopRig & {
  id: number;
  glyph: string;
  mesh: Mesh;
  weaponAnchor: Object3D;
  weaponVisual: WeaponVisual | null;
  hop: Hop | null;
  lunge: { dx: number; dz: number; t: number; struck: boolean } | null;
  settleT: number;
  dying: number | null;
  dust: DustBurst | null;
  gridX: number;
  gridZ: number;
  visible: boolean;
};

export function createActorView(
  font: Font,
  glyph: string,
  id: number,
  x: number,
  z: number,
  scene: Scene,
): ActorView {
  const style = tileStyle(glyph);
  const geo = makeGlyphGeometry(font, glyph, makeFitScale(font));
  const mat = new MeshStandardMaterial({
    color: style.color,
    emissive: new Color(style.emissive || 0x000000),
    emissiveIntensity: style.emissive ? 0.45 : 0,
    roughness: style.roughness,
    metalness: style.metalness,
  });
  const mesh = new Mesh(geo, mat);
  mesh.rotation.y = FACE_YAW;
  mesh.scale.set(style.sizeMul, style.yScale, style.sizeMul);

  const root = new Object3D();
  const hopGroup = new Object3D();
  const squash = new Object3D();
  const lean = new Object3D();
  const weaponAnchor = new Object3D();
  weaponAnchor.position.set(0.3, 0.5, 0.1);
  weaponAnchor.rotation.set(0, FACE_YAW, -0.15);
  lean.add(mesh);
  lean.add(weaponAnchor);
  squash.add(lean);
  hopGroup.add(squash);
  root.add(hopGroup);
  const p = worldPos(x, z);
  root.position.set(p.x, 0, p.z);
  scene.add(root);

  return {
    id,
    glyph,
    root,
    hopGroup,
    squash,
    lean,
    mesh,
    weaponAnchor,
    weaponVisual: null,
    hop: null,
    lunge: null,
    settleT: 1,
    dying: null,
    dust: null,
    gridX: x,
    gridZ: z,
    visible: true,
  };
}

export function setActorWeapon(
  view: ActorView,
  type: WeaponVisualType | undefined,
  rarity: ItemRarity | undefined,
): void {
  if (view.weaponVisual) {
    view.weaponAnchor.remove(view.weaponVisual.group);
    view.weaponVisual.dispose();
    view.weaponVisual = null;
  }
  if (!type) return;
  view.weaponVisual = buildWeaponVisual(type, rarity, getColors().weapon);
  view.weaponAnchor.add(view.weaponVisual.group);
}

export function setActorVisible(view: ActorView, on: boolean): void {
  view.visible = on;
  view.root.visible = on;
}

export function startActorHop(
  view: ActorView,
  toX: number,
  toZ: number,
): void {
  view.hop = {
    fromX: view.gridX,
    fromZ: view.gridZ,
    toX,
    toZ,
    t: 0,
    dx: Math.sign(toX - view.gridX),
    dz: Math.sign(toZ - view.gridZ),
  };
  view.lunge = null;
  view.settleT = 1;
}

export function startActorLunge(view: ActorView, dx: number, dz: number): void {
  view.lunge = { dx, dz, t: 0, struck: false };
  view.hop = null;
  view.settleT = 1;
}

export function updateActorView(
  view: ActorView,
  dt: number,
  time: number,
  reduced: boolean,
): "landed" | "lungeHit" | "lungeDone" | "dead" | "busy" | "idle" {
  if (view.dying !== null) {
    if (!view.dust) return "dead";
    const scene = view.root.parent as Scene | null;
    if (!scene) return "dead";
    if (updateDustBurst(view.dust, dt, scene)) return "dead";
    return "busy";
  }

  if (view.lunge) {
    if (reduced) {
      const hit = !view.lunge.struck;
      view.lunge = null;
      snapRig(view, view.gridX, view.gridZ);
      return hit ? "lungeHit" : "lungeDone";
    }
    view.lunge.t += dt / LUNGE_DURATION;
    const t = Math.min(view.lunge.t, 1);
    applyLungePose(view, view.lunge.dx, view.lunge.dz, t);
    let hit = false;
    if (!view.lunge.struck && t >= 0.45) {
      view.lunge.struck = true;
      hit = true;
    }
    if (t >= 1) {
      view.lunge = null;
      view.settleT = 0;
      return hit ? "lungeHit" : "lungeDone";
    }
    return hit ? "lungeHit" : "busy";
  }

  if (view.hop) {
    if (reduced) {
      view.gridX = view.hop.toX;
      view.gridZ = view.hop.toZ;
      view.hop = null;
      snapRig(view, view.gridX, view.gridZ);
      return "landed";
    }
    view.hop.t += dt / HOP_DURATION;
    const t = Math.min(view.hop.t, 1);
    applyHopPose(view, view.hop, t);
    if (t >= 1) {
      view.gridX = view.hop.toX;
      view.gridZ = view.hop.toZ;
      view.hop = null;
      view.settleT = 0;
      snapRig(view, view.gridX, view.gridZ);
      return "landed";
    }
    return "busy";
  }

  if (view.settleT < 1) {
    view.settleT = Math.min(1, view.settleT + dt / SETTLE_DURATION);
    const sy = 0.82 + 0.18 * view.settleT;
    const sxz = volumeScaleXZ(sy);
    view.squash.scale.set(sxz, sy, sxz);
    return "busy";
  }

  applyIdlePose(view, time, reduced);
  return "idle";
}

export function startActorDeath(
  view: ActorView,
  scene: Scene,
  explode: boolean,
  hitDx: number,
  hitDz: number,
  reduced: boolean,
): void {
  view.hop = null;
  view.lunge = null;
  view.dying = 0;
  view.mesh.visible = false;
  view.weaponAnchor.visible = false;
  if (view.dust) {
    disposeDustBurst(view.dust, scene);
    view.dust = null;
  }
  if (reduced) return;
  view.dust = burstGlyphDust(view.mesh, scene, explode, view.glyph, hitDx, hitDz);
}

const ELITE_SCALE = 1.12;
const ELITE_EMISSIVE_INTENSITY = 0.55;

export function retintActor(view: ActorView, elite = false): void {
  const style = tileStyle(view.glyph);
  const mat = view.mesh.material;
  if (Array.isArray(mat)) return;
  const m = mat as MeshStandardMaterial;
  m.color.setHex(style.color);
  m.emissive.setHex(elite ? getColors().gold : style.emissive || 0x000000);
  m.emissiveIntensity = elite ? ELITE_EMISSIVE_INTENSITY : style.emissive ? 0.45 : 0;
  const scale = elite ? ELITE_SCALE : 1;
  view.mesh.scale.set(style.sizeMul * scale, style.yScale * scale, style.sizeMul * scale);
  if (view.weaponVisual) {
    retintWeaponVisual(view.weaponVisual, elite ? "fine" : undefined, getColors().weapon);
  }
}

export function disposeActorView(view: ActorView, scene: Scene): void {
  if (view.dust) {
    disposeDustBurst(view.dust, scene);
    view.dust = null;
  }
  scene.remove(view.root);
  view.mesh.geometry.dispose();
  const mat = view.mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
  view.weaponVisual?.dispose();
}
