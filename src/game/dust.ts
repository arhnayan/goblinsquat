import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Vector3,
  type BufferGeometry,
  type Scene,
} from "three";

export type DustBurst = {
  mesh: InstancedMesh;
  flash: PointLight | null;
  explode: boolean;
  t: number;
  duration: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  scale: Float32Array;
  delay: Float32Array;
  rest: Float32Array;
  count: number;
};

const dummy = new Object3D();
const worldScale = new Vector3();
const tint = new Color();
const sharedBox = new BoxGeometry(1, 1, 1);
const localCache = new Map<string, Float32Array>();

function inTri2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function voxelizeLocal(geo: BufferGeometry): Float32Array {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.getAttribute("position");
  if (!bb || !pos) return new Float32Array(0);

  const dx = Math.max(bb.max.x - bb.min.x, 0.08);
  const dy = Math.max(bb.max.y - bb.min.y, 0.08);
  const dz = Math.max(bb.max.z - bb.min.z, 0.04);
  const vs = Math.max(dx / 16, dy / 18, dz / 6, 0.048);
  const nx = Math.max(1, Math.ceil(dx / vs));
  const ny = Math.max(1, Math.ceil(dy / vs));
  const nz = Math.max(1, Math.ceil(dz / vs));
  const occ = new Uint8Array(nx * ny * nz);
  const at = (ix: number, iy: number, iz: number) => ix + nx * (iy + ny * iz);
  const stamp = (ix: number, iy: number, iz: number) => {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    occ[at(ix, iy, iz)] = 1;
  };
  const stampWorld = (x: number, y: number, z: number) => {
    stamp(
      Math.floor((x - bb.min.x) / vs),
      Math.floor((y - bb.min.y) / vs),
      Math.floor((z - bb.min.z) / vs),
    );
  };
  const stampEdge = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ) => {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / (vs * 0.55)),
    );
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      stampWorld(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    }
  };

  const index = geo.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const read = (i: number, out: { x: number; y: number; z: number }) => {
    const vi = index ? index.getX(i) : i;
    out.x = pos.getX(vi);
    out.y = pos.getY(vi);
    out.z = pos.getZ(vi);
  };
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };
  const c = { x: 0, y: 0, z: 0 };

  for (let t = 0; t < triCount; t++) {
    read(t * 3, a);
    read(t * 3 + 1, b);
    read(t * 3 + 2, c);
    stampEdge(a.x, a.y, a.z, b.x, b.y, b.z);
    stampEdge(b.x, b.y, b.z, c.x, c.y, c.z);
    stampEdge(c.x, c.y, c.z, a.x, a.y, a.z);
    const minx = Math.min(a.x, b.x, c.x);
    const miny = Math.min(a.y, b.y, c.y);
    const minz = Math.min(a.z, b.z, c.z);
    const maxx = Math.max(a.x, b.x, c.x);
    const maxy = Math.max(a.y, b.y, c.y);
    const maxz = Math.max(a.z, b.z, c.z);
    const x0 = Math.max(0, Math.floor((minx - bb.min.x) / vs));
    const y0 = Math.max(0, Math.floor((miny - bb.min.y) / vs));
    const z0 = Math.max(0, Math.floor((minz - bb.min.z) / vs));
    const x1 = Math.min(nx - 1, Math.floor((maxx - bb.min.x) / vs));
    const y1 = Math.min(ny - 1, Math.floor((maxy - bb.min.y) / vs));
    const z1 = Math.min(nz - 1, Math.floor((maxz - bb.min.z) / vs));
    for (let iy = y0; iy <= y1; iy++) {
      const py = bb.min.y + (iy + 0.5) * vs;
      for (let ix = x0; ix <= x1; ix++) {
        const px = bb.min.x + (ix + 0.5) * vs;
        if (!inTri2(px, py, a.x, a.y, b.x, b.y, c.x, c.y)) continue;
        for (let iz = z0; iz <= z1; iz++) stamp(ix, iy, iz);
      }
    }
  }

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      let z0 = -1;
      let z1 = -1;
      for (let iz = 0; iz < nz; iz++) {
        if (!occ[at(ix, iy, iz)]) continue;
        if (z0 < 0) z0 = iz;
        z1 = iz;
      }
      if (z0 < 0) continue;
      for (let iz = z0; iz <= z1; iz++) occ[at(ix, iy, iz)] = 1;
    }
  }

  let count = 0;
  for (let i = 0; i < occ.length; i++) if (occ[i]) count += 1;
  const max = 680;
  const stride = count > max ? Math.ceil(count / max) : 1;
  const pts: number[] = [];
  let seen = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        if (!occ[at(ix, iy, iz)]) continue;
        if (seen++ % stride !== 0) continue;
        pts.push(
          bb.min.x + (ix + 0.5) * vs,
          bb.min.y + (iy + 0.5) * vs,
          bb.min.z + (iz + 0.5) * vs,
        );
      }
    }
  }
  return new Float32Array(pts);
}

function localPoints(mesh: Mesh, glyph: string): Float32Array {
  let pts = localCache.get(glyph);
  if (!pts) {
    pts = voxelizeLocal(mesh.geometry);
    localCache.set(glyph, pts);
  }
  return pts;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function signRand(): number {
  return Math.random() * 2 - 1;
}

export function burstGlyphDust(
  mesh: Mesh,
  scene: Scene,
  explode: boolean,
  glyph: string,
  hitDx: number,
  hitDz: number,
): DustBurst {
  mesh.updateWorldMatrix(true, false);
  mesh.getWorldScale(worldScale);
  const localsRaw = localPoints(mesh, glyph);
  const locals =
    localsRaw.length >= 3 ? localsRaw : new Float32Array([0, 0.35, 0]);
  const n = locals.length / 3;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const vz = new Float32Array(n);
  const rx = new Float32Array(n);
  const ry = new Float32Array(n);
  const rz = new Float32Array(n);
  const wx = new Float32Array(n);
  const wy = new Float32Array(n);
  const wz = new Float32Array(n);
  const scale = new Float32Array(n);
  const delay = new Float32Array(n);
  const rest = new Float32Array(n);

  const world = new Vector3();
  const mat = mesh.matrixWorld;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    world.set(locals[i * 3]!, locals[i * 3 + 1]!, locals[i * 3 + 2]!);
    world.applyMatrix4(mat);
    px[i] = world.x + signRand() * 0.012;
    py[i] = world.y + signRand() * 0.008;
    pz[i] = world.z + signRand() * 0.012;
    cx += world.x;
    cy += world.y;
    cz += world.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;

  const cube =
    0.038 *
    Math.max(0.55, (worldScale.x + worldScale.y + worldScale.z) / 3);
  const hitLen = Math.hypot(hitDx, hitDz) || 1;
  const hx = hitDx / hitLen;
  const hz = hitDz / hitLen;

  for (let i = 0; i < n; i++) {
    const ox = px[i]! - cx;
    const oy = py[i]! - cy;
    const oz = pz[i]! - cz;
    const len = Math.hypot(ox, oy, oz) || 1;
    const nx = ox / len;
    const ny = oy / len;
    const nz = oz / len;
    if (explode) {
      const shard = Math.random() < 0.28;
      const spd = (shard ? rand(9.2, 14.5) : rand(5.4, 9.8)) * (0.7 + len * 1.1);
      vx[i] = nx * spd + hx * rand(3.2, 6.4) + signRand() * 1.4;
      vy[i] = ny * spd * 0.72 + rand(2.4, 5.8);
      vz[i] = nz * spd + hz * rand(3.2, 6.4) + signRand() * 1.4;
      wx[i] = signRand() * 18;
      wy[i] = signRand() * 22;
      wz[i] = signRand() * 18;
      scale[i] = cube * rand(0.55, 1.05);
      delay[i] = Math.random() * 0.03;
    } else {
      vx[i] = signRand() * 0.42;
      vy[i] = rand(-0.15, 0.55);
      vz[i] = signRand() * 0.42;
      wx[i] = signRand() * 3.5;
      wy[i] = signRand() * 4.2;
      wz[i] = signRand() * 3.5;
      scale[i] = cube * rand(0.48, 0.86);
      delay[i] = (1 - Math.min(1, Math.max(0, (py[i]! - (cy - 0.4)) / 1.2))) * 0.16 +
        Math.random() * 0.05;
    }
    rx[i] = Math.random() * Math.PI;
    ry[i] = Math.random() * Math.PI;
    rz[i] = Math.random() * Math.PI;
    rest[i] = 0;
  }

  const src = mesh.material;
  const srcMat = Array.isArray(src) ? src[0] : src;
  const color = new Color(
    srcMat && "color" in srcMat ? (srcMat as MeshStandardMaterial).color : 0xc8a878,
  );
  const dustMat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: explode ? 0.42 : 0.7,
    metalness: explode ? 0.16 : 0.04,
    emissive: color,
    emissiveIntensity: explode ? 0.85 : 0.12,
    transparent: true,
    opacity: 1,
  });
  const inst = new InstancedMesh(sharedBox, dustMat, n);
  inst.instanceMatrix.setUsage(DynamicDrawUsage);
  inst.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
  inst.frustumCulled = false;
  inst.matrixAutoUpdate = false;
  for (let i = 0; i < n; i++) {
    tint.copy(color);
    tint.offsetHSL(0, 0, (Math.random() - 0.5) * 0.16);
    inst.setColorAt(i, tint);
    dummy.position.set(px[i]!, py[i]!, pz[i]!);
    dummy.rotation.set(rx[i]!, ry[i]!, rz[i]!);
    dummy.scale.setScalar(scale[i]!);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);

  let flash: PointLight | null = null;
  if (explode) {
    flash = new PointLight(color, 8.5, 7.5, 1.6);
    flash.position.set(cx, cy + 0.35, cz);
    scene.add(flash);
  }

  return {
    mesh: inst,
    flash,
    explode,
    t: 0,
    duration: explode ? 0.78 : 0.52,
    px,
    py,
    pz,
    vx,
    vy,
    vz,
    rx,
    ry,
    rz,
    wx,
    wy,
    wz,
    scale,
    delay,
    rest,
    count: n,
  };
}

export function updateDustBurst(burst: DustBurst, dt: number, scene: Scene): boolean {
  burst.t += dt;
  const u = Math.min(1, burst.t / burst.duration);
  const gravity = burst.explode ? 22 : 16.5;
  const drag = burst.explode ? 1.35 : 2.4;
  const bounce = burst.explode ? 0.28 : 0.08;
  const fade = burst.explode ? 0.58 : 0.55;
  const mat = burst.mesh.material as MeshStandardMaterial;
  mat.opacity = u < fade ? 1 : 1 - (u - fade) / (1 - fade);
  if (burst.explode) {
    mat.emissiveIntensity = 0.85 * (1 - u) * (1 - u);
  }
  if (burst.flash) {
    burst.flash.intensity = 8.5 * Math.max(0, 1 - burst.t / 0.22) ** 2;
    if (burst.t > 0.24) {
      scene.remove(burst.flash);
      burst.flash.dispose();
      burst.flash = null;
    }
  }

  const n = burst.count;
  const damp = Math.exp(-drag * dt);
  for (let i = 0; i < n; i++) {
    if (burst.t < burst.delay[i]!) continue;
    if (burst.rest[i]! < 1) {
      burst.vy[i]! -= gravity * dt;
      burst.vx[i]! *= damp;
      burst.vz[i]! *= damp;
      burst.px[i]! += burst.vx[i]! * dt;
      burst.py[i]! += burst.vy[i]! * dt;
      burst.pz[i]! += burst.vz[i]! * dt;
      burst.rx[i]! += burst.wx[i]! * dt;
      burst.ry[i]! += burst.wy[i]! * dt;
      burst.rz[i]! += burst.wz[i]! * dt;
      if (burst.py[i]! <= 0.03) {
        burst.py[i] = 0.03;
        burst.vy[i]! *= -bounce;
        burst.vx[i]! *= 0.55;
        burst.vz[i]! *= 0.55;
        burst.wx[i]! *= 0.45;
        burst.wy[i]! *= 0.45;
        burst.wz[i]! *= 0.45;
        if (Math.abs(burst.vy[i]!) < 0.8) {
          burst.vy[i] = 0;
          burst.rest[i] = 1;
        }
      }
    } else {
      burst.vx[i]! *= 0.86;
      burst.vz[i]! *= 0.86;
      burst.px[i]! += burst.vx[i]! * dt;
      burst.pz[i]! += burst.vz[i]! * dt;
    }
    const lifeScale = u < fade ? 1 : Math.max(0.02, 1 - (u - fade) / (1 - fade));
    dummy.position.set(burst.px[i]!, burst.py[i]!, burst.pz[i]!);
    dummy.rotation.set(burst.rx[i]!, burst.ry[i]!, burst.rz[i]!);
    dummy.scale.setScalar(burst.scale[i]! * lifeScale);
    dummy.updateMatrix();
    burst.mesh.setMatrixAt(i, dummy.matrix);
  }
  burst.mesh.instanceMatrix.needsUpdate = true;
  return u >= 1;
}

export function disposeDustBurst(burst: DustBurst, scene: Scene): void {
  scene.remove(burst.mesh);
  const mat = burst.mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
  if (burst.flash) {
    scene.remove(burst.flash);
    burst.flash.dispose();
    burst.flash = null;
  }
}
