import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Vector3,
  type Scene,
} from "three";
import { worldPos } from "./dungeon";
import { clamp01, easeOutCubic } from "./anim";

const FIRE_Y = 0.82;
const TRACER_RADIUS = 0.02;
const TRAIL_LEN = 0.45;
const TAIL_FADE = 0.12;
const MUZZLE_FLASH_TIME = 0.16;
const IMPACT_FLASH_TIME = 0.14;
const IMPACT_DURATION = 0.32;

export type PelletHit = "wall" | "monster" | "none";

export type PelletResult = {
  toGridX: number;
  toGridZ: number;
  hit: PelletHit;
};

type Tracer = {
  mesh: Mesh;
  material: MeshBasicMaterial;
  from: Vector3;
  dir: Vector3;
  dist: number;
  travelTime: number;
  hit: PelletHit;
  impactSpawned: boolean;
  dead: boolean;
};

type Spark = {
  mesh: InstancedMesh;
  material: MeshBasicMaterial;
  flash: PointLight | null;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  t: number;
  duration: number;
};

export type ShotgunBlast = {
  tracers: Tracer[];
  sparks: Spark[];
  flash: PointLight | null;
  t: number;
};

const dummy = new Object3D();
const UP = new Vector3(0, 1, 0);
const sharedTracer = new CylinderGeometry(TRACER_RADIUS, TRACER_RADIUS * 0.35, 1, 6, 1, true);
const sharedSpark = new BoxGeometry(0.05, 0.05, 0.05);

function spawnImpact(
  burst: ShotgunBlast,
  scene: Scene,
  at: Vector3,
  tint: Color,
  hit: PelletHit,
): void {
  if (hit === "none") return;
  const n = hit === "monster" ? 10 : 6;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const vz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = at.x;
    py[i] = at.y;
    pz[i] = at.z;
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.1 + Math.random() * 2.3;
    vx[i] = Math.cos(ang) * spd;
    vz[i] = Math.sin(ang) * spd;
    vy[i] = 1.3 + Math.random() * 2.1;
  }
  const material = new MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity: 1,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new InstancedMesh(sharedSpark, material, n);
  mesh.frustumCulled = false;
  for (let i = 0; i < n; i++) {
    dummy.position.set(px[i]!, py[i]!, pz[i]!);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
  let flash: PointLight | null = null;
  if (hit === "monster") {
    flash = new PointLight(tint, 5, 3, 2);
    flash.position.copy(at);
    scene.add(flash);
  }
  burst.sparks.push({
    mesh,
    material,
    flash,
    px,
    py,
    pz,
    vx,
    vy,
    vz,
    t: 0,
    duration: IMPACT_DURATION,
  });
}

/**
 * Fires a fan of pellets from a grid cell, rendered as growing/trailing
 * phosphor tracers converging on their resolved impact points, plus a
 * muzzle flash and per-pellet impact sparks. Damage is expected to have
 * already been resolved by the caller — this is purely the visual layer.
 */
export function spawnShotgunBlast(
  scene: Scene,
  fromGridX: number,
  fromGridZ: number,
  pellets: PelletResult[],
  color: number,
  reduced: boolean,
): ShotgunBlast {
  const originWorld = worldPos(fromGridX, fromGridZ);
  const origin = new Vector3(originWorld.x, FIRE_Y, originWorld.z);
  const tint = new Color(color);
  const burst: ShotgunBlast = { tracers: [], sparks: [], flash: null, t: 0 };

  const flash = new PointLight(tint, 9, 6, 2);
  flash.position.copy(origin);
  scene.add(flash);
  burst.flash = flash;

  for (const p of pellets) {
    const endWorld = worldPos(p.toGridX, p.toGridZ);
    const to = new Vector3(endWorld.x, FIRE_Y, endWorld.z);
    if (reduced) {
      spawnImpact(burst, scene, to, tint, p.hit);
      continue;
    }
    const dist = origin.distanceTo(to);
    if (dist < 0.02) {
      spawnImpact(burst, scene, to, tint, p.hit);
      continue;
    }
    const dir = to.clone().sub(origin).normalize();
    const material = new MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(sharedTracer, material);
    mesh.frustumCulled = false;
    mesh.quaternion.setFromUnitVectors(UP, dir);
    scene.add(mesh);
    burst.tracers.push({
      mesh,
      material,
      from: origin.clone(),
      dir,
      dist,
      travelTime: 0.06 + dist * 0.02,
      hit: p.hit,
      impactSpawned: false,
      dead: false,
    });
  }

  return burst;
}

export function updateProjectileBurst(burst: ShotgunBlast, dt: number, scene: Scene): boolean {
  burst.t += dt;

  if (burst.flash) {
    const life = Math.max(0, 1 - burst.t / MUZZLE_FLASH_TIME);
    burst.flash.intensity = life * life * 9;
    if (burst.t > MUZZLE_FLASH_TIME) {
      scene.remove(burst.flash);
      burst.flash.dispose();
      burst.flash = null;
    }
  }

  for (const tr of burst.tracers) {
    const totalTime = tr.travelTime + TAIL_FADE;
    const tt = Math.min(burst.t, totalTime);
    const headEase = easeOutCubic(clamp01(tt / tr.travelTime));
    const headDist = tr.dist * headEase;
    let tailDist = Math.max(0, headDist - Math.min(TRAIL_LEN, tr.dist));
    let opacity = 0.95;
    if (tt > tr.travelTime) {
      const fadeU = clamp01((tt - tr.travelTime) / TAIL_FADE);
      tailDist = Math.max(tailDist, tr.dist * fadeU);
      opacity = 0.95 * (1 - fadeU);
    }

    if (!tr.impactSpawned && tt >= tr.travelTime) {
      const at = tr.from.clone().addScaledVector(tr.dir, tr.dist);
      const tint = tr.material.color;
      spawnImpact(burst, scene, at, tint, tr.hit);
      tr.impactSpawned = true;
    }

    if (tt >= totalTime) {
      scene.remove(tr.mesh);
      tr.material.dispose();
      tr.dead = true;
      continue;
    }

    const segStart = tr.from.clone().addScaledVector(tr.dir, tailDist);
    const segEnd = tr.from.clone().addScaledVector(tr.dir, headDist);
    const len = Math.max(0.001, segEnd.distanceTo(segStart));
    tr.mesh.position.copy(segStart).addScaledVector(tr.dir, len / 2);
    tr.mesh.scale.set(1, len, 1);
    tr.material.opacity = opacity;
  }
  burst.tracers = burst.tracers.filter((t) => !t.dead);

  for (const sp of burst.sparks) {
    sp.t += dt;
    const u = Math.min(1, sp.t / sp.duration);
    const n = sp.px.length;
    for (let i = 0; i < n; i++) {
      sp.vy[i]! -= 6.5 * dt;
      sp.px[i]! += sp.vx[i]! * dt;
      sp.py[i]! += sp.vy[i]! * dt;
      sp.pz[i]! += sp.vz[i]! * dt;
      dummy.position.set(sp.px[i]!, Math.max(0.02, sp.py[i]!), sp.pz[i]!);
      dummy.scale.setScalar(Math.max(0.001, 1 - u));
      dummy.updateMatrix();
      sp.mesh.setMatrixAt(i, dummy.matrix);
    }
    sp.mesh.instanceMatrix.needsUpdate = true;
    sp.material.opacity = 1 - u;
    if (sp.flash) {
      sp.flash.intensity = 5 * Math.max(0, 1 - sp.t / IMPACT_FLASH_TIME) ** 2;
      if (sp.t > IMPACT_FLASH_TIME) {
        scene.remove(sp.flash);
        sp.flash.dispose();
        sp.flash = null;
      }
    }
  }
  burst.sparks = burst.sparks.filter((sp) => {
    const done = sp.t >= sp.duration && !sp.flash;
    if (done) {
      scene.remove(sp.mesh);
      sp.material.dispose();
    }
    return !done;
  });

  return !burst.flash && burst.tracers.length === 0 && burst.sparks.length === 0;
}

export function disposeProjectileBurst(burst: ShotgunBlast, scene: Scene): void {
  for (const tr of burst.tracers) {
    scene.remove(tr.mesh);
    tr.material.dispose();
  }
  burst.tracers = [];
  for (const sp of burst.sparks) {
    scene.remove(sp.mesh);
    sp.material.dispose();
    if (sp.flash) {
      scene.remove(sp.flash);
      sp.flash.dispose();
    }
  }
  burst.sparks = [];
  if (burst.flash) {
    scene.remove(burst.flash);
    burst.flash.dispose();
    burst.flash = null;
  }
}
