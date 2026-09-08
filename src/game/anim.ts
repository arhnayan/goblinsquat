import { Object3D } from "three";
import { worldPos } from "./dungeon";

export const HOP_DURATION = 0.3;
export const LUNGE_DURATION = 0.22;
export const SETTLE_DURATION = 0.08;
export const HOP_PEAK = 0.62;
export const IDLE_PERIOD = 2;
export const FACE_YAW = Math.PI / 4;
export const BOOT_DROP = 2.35;
export const BOOT_DURATION = 0.5;

export type Hop = {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  dx: number;
  dz: number;
};

export type HopRig = {
  root: Object3D;
  hopGroup: Object3D;
  squash: Object3D;
  lean: Object3D;
};

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t) - 1;
  return 1 + x * x * x;
}

export function hopHeight(t: number, peak = HOP_PEAK): number {
  return Math.sin(clamp01(t) * Math.PI) * peak;
}

export function hopScaleY(t: number): number {
  return 0.82 + 0.3 * Math.sin(clamp01(t) * Math.PI);
}

export function volumeScaleXZ(scaleY: number): number {
  return 1 / Math.sqrt(Math.max(scaleY, 0.2));
}

export function hopLean(t: number): number {
  return (8 * Math.PI) / 180 * Math.sin(clamp01(t) * Math.PI);
}

export function idleBob(time: number): { y: number; scaleY: number } {
  const a = Math.sin((time / IDLE_PERIOD) * Math.PI * 2);
  return { y: a * 0.045, scaleY: 1 + a * 0.03 };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applyHopPose(rig: HopRig, hop: Hop, t: number): void {
  const u = smoothstep(t);
  const from = worldPos(hop.fromX, hop.fromZ);
  const to = worldPos(hop.toX, hop.toZ);
  rig.root.position.set(
    from.x + (to.x - from.x) * u,
    0,
    from.z + (to.z - from.z) * u,
  );
  rig.hopGroup.position.y = hopHeight(t);
  const sy = hopScaleY(t);
  const sxz = volumeScaleXZ(sy);
  rig.squash.scale.set(sxz, sy, sxz);
  const leanAmt = hopLean(t);
  rig.lean.rotation.x = leanAmt * hop.dz;
  rig.lean.rotation.z = -leanAmt * hop.dx;
  rig.root.rotation.y = hop.dx * 0.22 + hop.dz * 0.08;
}

export function applyLungePose(rig: HopRig, dx: number, dz: number, t: number): void {
  rig.hopGroup.position.y = hopHeight(t) * 0.32;
  const sy = hopScaleY(t);
  const sxz = volumeScaleXZ(sy);
  rig.squash.scale.set(sxz, sy, sxz);
  const leanAmt = hopLean(t) * 1.4;
  rig.lean.rotation.x = leanAmt * dz;
  rig.lean.rotation.z = -leanAmt * dx;
  rig.root.rotation.y = dx * 0.22 + dz * 0.08;
}

export function applyIdlePose(
  rig: HopRig,
  time: number,
  reduced: boolean,
): void {
  if (reduced) {
    rig.hopGroup.position.y = 0;
    rig.squash.scale.set(1, 1, 1);
    rig.lean.rotation.set(0, 0, 0);
    return;
  }
  const bob = idleBob(time);
  rig.hopGroup.position.y = bob.y;
  rig.squash.scale.set(1, bob.scaleY, 1);
  rig.lean.rotation.set(0, 0, 0);
}

export function snapRig(rig: HopRig, gx: number, gz: number): void {
  const p = worldPos(gx, gz);
  rig.root.position.set(p.x, 0, p.z);
  rig.hopGroup.position.y = 0;
  rig.squash.scale.set(1, 1, 1);
  rig.lean.rotation.set(0, 0, 0);
}
