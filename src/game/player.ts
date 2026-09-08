import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
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

export type PlayerIntent =
  | { type: "move"; dx: number; dz: number }
  | { type: "wait" }
  | { type: "quaff" }
  | { type: "restart" };

export type Player = HopRig & {
  follow: Object3D;
  torch: PointLight;
  gridX: number;
  gridZ: number;
  hop: Hop | null;
  lunge: { dx: number; dz: number; t: number; struck: boolean } | null;
  settleT: number;
  busy: boolean;
  consumeIntent: () => PlayerIntent | null;
  startHop: (toX: number, toZ: number) => void;
  startLunge: (dx: number, dz: number) => void;
  place: (x: number, z: number) => void;
  retint: () => void;
  update: (
    dt: number,
    time: number,
    reduced: boolean,
  ) => "landed" | "lungeHit" | "lungeDone" | "idle" | "busy";
  dispose: (scene: Scene) => void;
};

const KEY_DIRS: Record<string, { dx: number; dz: number }> = {
  KeyW: { dx: 0, dz: -1 },
  ArrowUp: { dx: 0, dz: -1 },
  KeyS: { dx: 0, dz: 1 },
  ArrowDown: { dx: 0, dz: 1 },
  KeyA: { dx: -1, dz: 0 },
  ArrowLeft: { dx: -1, dz: 0 },
  KeyD: { dx: 1, dz: 0 },
  ArrowRight: { dx: 1, dz: 0 },
};

export function createPlayer(
  font: Font,
  x: number,
  z: number,
  scene: Scene,
): Player {
  const style = tileStyle("@");
  const c = getColors();
  const geo = makeGlyphGeometry(font, "@", makeFitScale(font));
  const mat = new MeshStandardMaterial({
    color: c.player,
    emissive: new Color(c.player),
    emissiveIntensity: 0.48,
    roughness: style.roughness,
    metalness: style.metalness,
  });
  const glyph = new Mesh(geo, mat);
  glyph.rotation.y = FACE_YAW;
  glyph.scale.set(1, style.yScale, 1);

  const root = new Object3D();
  const follow = new Object3D();
  const hopGroup = new Object3D();
  const squash = new Object3D();
  const lean = new Object3D();
  lean.add(glyph);
  squash.add(lean);
  hopGroup.add(squash);
  root.add(hopGroup);

  const torch = new PointLight(c.player, 5.6, 12.5, 1.3);
  torch.position.set(0, 1.35, 0);
  root.add(torch);
  const bounce = new PointLight(c.player, 1.45, 20, 1.12);
  bounce.position.set(0, 2.2, 0);
  root.add(bounce);

  const spawn = worldPos(x, z);
  root.position.set(spawn.x, 0, spawn.z);
  follow.position.copy(root.position);
  scene.add(root);
  scene.add(follow);

  const held = new Set<string>();
  const taps: PlayerIntent[] = [];
  let hop: Hop | null = null;
  let lunge: Player["lunge"] = null;
  let settleT = 1;
  let gridX = x;
  let gridZ = z;

  const onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code in KEY_DIRS) {
      e.preventDefault();
      held.add(e.code);
      const d = KEY_DIRS[e.code]!;
      taps.push({ type: "move", dx: d.dx, dz: d.dz });
      if (taps.length > 1) taps.shift();
      return;
    }
    if (e.code === "Space" || e.code === "Period") {
      e.preventDefault();
      taps.push({ type: "wait" });
      return;
    }
    if (e.code === "KeyQ") {
      e.preventDefault();
      taps.push({ type: "quaff" });
      return;
    }
    if (e.code === "KeyR") {
      e.preventDefault();
      taps.push({ type: "restart" });
    }
  };
  const onUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  const heldDir = (): { dx: number; dz: number } | null => {
    const order = [
      "KeyW",
      "ArrowUp",
      "KeyS",
      "ArrowDown",
      "KeyA",
      "ArrowLeft",
      "KeyD",
      "ArrowRight",
    ];
    for (const code of order) {
      if (!held.has(code)) continue;
      return KEY_DIRS[code]!;
    }
    return null;
  };

  const consumeIntent = (): PlayerIntent | null => {
    const tap = taps.shift();
    if (tap) return tap;
    const dir = heldDir();
    if (dir) return { type: "move", dx: dir.dx, dz: dir.dz };
    return null;
  };

  const startHop = (toX: number, toZ: number) => {
    hop = {
      fromX: gridX,
      fromZ: gridZ,
      toX,
      toZ,
      t: 0,
      dx: Math.sign(toX - gridX),
      dz: Math.sign(toZ - gridZ),
    };
    lunge = null;
    settleT = 1;
  };

  const startLunge = (dx: number, dz: number) => {
    lunge = { dx, dz, t: 0, struck: false };
    hop = null;
    settleT = 1;
  };

  const place = (nx: number, nz: number) => {
    gridX = nx;
    gridZ = nz;
    hop = null;
    lunge = null;
    settleT = 1;
    snapRig({ root, hopGroup, squash, lean }, nx, nz);
    follow.position.copy(root.position);
  };

  const update = (
    dt: number,
    time: number,
    reduced: boolean,
  ): "landed" | "lungeHit" | "lungeDone" | "idle" | "busy" => {
    torch.intensity = reduced
      ? 5.5
      : 5.5 + Math.sin(time * 23) * 0.35 + Math.sin(time * 41) * 0.18;
    bounce.intensity = reduced
      ? 1.4
      : 1.4 + Math.sin(time * 19) * 0.12;

    let result: "landed" | "lungeHit" | "lungeDone" | "idle" | "busy" = "idle";

    if (lunge) {
      if (reduced) {
        const hit = !lunge.struck;
        lunge = null;
        snapRig({ root, hopGroup, squash, lean }, gridX, gridZ);
        result = hit ? "lungeHit" : "lungeDone";
      } else {
        lunge.t += dt / LUNGE_DURATION;
        const t = Math.min(lunge.t, 1);
        applyLungePose({ root, hopGroup, squash, lean }, lunge.dx, lunge.dz, t);
        let hit = false;
        if (!lunge.struck && t >= 0.45) {
          lunge.struck = true;
          hit = true;
        }
        if (t >= 1) {
          lunge = null;
          settleT = 0;
          result = hit ? "lungeHit" : "lungeDone";
        } else result = hit ? "lungeHit" : "busy";
      }
    } else if (hop) {
      if (reduced) {
        gridX = hop.toX;
        gridZ = hop.toZ;
        hop = null;
        snapRig({ root, hopGroup, squash, lean }, gridX, gridZ);
        result = "landed";
      } else {
        hop.t += dt / HOP_DURATION;
        const t = Math.min(hop.t, 1);
        applyHopPose({ root, hopGroup, squash, lean }, hop, t);
        if (t >= 1) {
          gridX = hop.toX;
          gridZ = hop.toZ;
          hop = null;
          settleT = 0;
          snapRig({ root, hopGroup, squash, lean }, gridX, gridZ);
          result = "landed";
        } else result = "busy";
      }
    } else if (settleT < 1) {
      settleT = Math.min(1, settleT + dt / SETTLE_DURATION);
      const sy = 0.82 + 0.18 * settleT;
      const sxz = volumeScaleXZ(sy);
      squash.scale.set(sxz, sy, sxz);
      result = "busy";
    } else {
      applyIdlePose({ root, hopGroup, squash, lean }, time, reduced);
      result = "idle";
    }

    follow.position.x = root.position.x;
    follow.position.y = 0;
    follow.position.z = root.position.z;
    return result;
  };

  const retint = () => {
    const col = getColors();
    mat.color.setHex(col.player);
    mat.emissive.setHex(col.player);
    torch.color.setHex(col.player);
    bounce.color.setHex(col.player);
  };

  const dispose = (sc: Scene) => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    sc.remove(root);
    sc.remove(follow);
    glyph.geometry.dispose();
    mat.dispose();
    torch.dispose();
    bounce.dispose();
  };

  const player: Player = {
    root,
    hopGroup,
    squash,
    lean,
    follow,
    torch,
    get gridX() {
      return gridX;
    },
    get gridZ() {
      return gridZ;
    },
    get hop() {
      return hop;
    },
    get lunge() {
      return lunge;
    },
    get settleT() {
      return settleT;
    },
    get busy() {
      return hop !== null || lunge !== null;
    },
    consumeIntent,
    startHop,
    startLunge,
    place,
    retint,
    update,
    dispose,
  };
  return player;
}
