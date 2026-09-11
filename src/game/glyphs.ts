import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShapePath,
  type Scene,
} from "three";
import { parse as parseFont, type Font } from "opentype.js";
import {
  CELL,
  charAt,
  cellKey,
  tileStyle,
  type Dungeon,
  shouldDraw,
  worldPos,
} from "./dungeon";
import {
  BOOT_DROP,
  BOOT_DURATION,
  easeOutCubic,
  FACE_YAW,
  prefersReducedMotion,
} from "./anim";

export type GlyphInstance = {
  char: string;
  index: number;
  gx: number;
  gz: number;
  baseY: number;
  yScale: number;
  sizeMul: number;
  phase: number;
  mesh: InstancedMesh;
  color: Color;
};

export type GlyphWorld = {
  meshes: Map<string, InstancedMesh>;
  instances: GlyphInstance[];
  byCell: Map<string, GlyphInstance>;
  update: (time: number) => void;
  punchFloor: (gx: number, gz: number) => void;
  applyFov: (visible: Set<string>, seen: boolean[][]) => void;
  hideCell: (x: number, z: number) => void;
  showFloorAt: (x: number, z: number) => void;
  resetBoot: (spawnX: number, spawnZ: number) => void;
  retint: () => void;
  dispose: () => void;
};

const dummy = new Object3D();
const punches = new Map<string, number>();
const visScratch = new Color();

function pathToShapes(font: Font, char: string, size: number) {
  const path = font.getPath(char, 0, 0, size);
  const shapePath = new ShapePath();
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case "M":
        shapePath.moveTo(cmd.x, -cmd.y);
        break;
      case "L":
        shapePath.lineTo(cmd.x, -cmd.y);
        break;
      case "C":
        shapePath.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y);
        break;
      case "Q":
        shapePath.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y);
        break;
      case "Z":
        shapePath.currentPath?.closePath();
        break;
    }
  }
  return shapePath.toShapes();
}

export function makeGlyphGeometry(
  font: Font,
  char: string,
  fitScale?: number,
): BufferGeometry {
  const shapes = pathToShapes(font, char, 100);
  const source = shapes.length === 0 ? pathToShapes(font, "?", 100) : shapes;
  const geo = new ExtrudeGeometry(source, extrudeSettings());
  return normalizeGlyph(geo, fitScale);
}

export function makeFitScale(font: Font): number {
  const shapes = pathToShapes(font, "#", 100);
  const geo = new ExtrudeGeometry(shapes, extrudeSettings());
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.dispose();
  if (!bb) return 1;
  const h = bb.max.y - bb.min.y;
  const w = bb.max.x - bb.min.x;
  return (CELL * 0.9) / Math.max(w, h, 0.001);
}

function extrudeSettings() {
  return {
    depth: 18,
    bevelEnabled: true,
    bevelThickness: 2.4,
    bevelSize: 1.8,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 6,
  };
}

function normalizeGlyph(
  geo: BufferGeometry,
  fitScale?: number,
): BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;
  geo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -bb.min.y,
    -(bb.min.z + bb.max.z) / 2,
  );
  if (fitScale !== undefined) {
    geo.scale(fitScale, fitScale, fitScale * 0.9);
  } else {
    const w = bb.max.x - bb.min.x;
    const h = bb.max.y - bb.min.y;
    const s = (CELL * 0.9) / Math.max(w, h, 0.001);
    geo.scale(s, s, s * 0.9);
  }
  geo.computeBoundingBox();
  return geo;
}

export async function loadFont(): Promise<Font> {
  const res = await fetch("/fonts/vt323.ttf");
  if (!res.ok) throw new Error(`Font load failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return parseFont(buf);
}

function writeInstance(
  inst: GlyphInstance,
  y: number,
  rotY: number,
  vis: "hidden" | "memory" | "visible",
): void {
  dummy.position.set(inst.gx * CELL, y, inst.gz * CELL);
  dummy.rotation.set(0, rotY, 0);
  if (vis === "hidden") dummy.scale.set(0, 0, 0);
  else dummy.scale.set(inst.sizeMul, inst.yScale, inst.sizeMul);
  dummy.updateMatrix();
  inst.mesh.setMatrixAt(inst.index, dummy.matrix);
  visScratch.copy(inst.color);
  if (vis === "memory") visScratch.multiplyScalar(0.48);
  inst.mesh.setColorAt(inst.index, visScratch);
}

export function buildGlyphWorld(
  font: Font,
  dungeon: Dungeon,
  scene: Scene,
): GlyphWorld {
  const reduced = prefersReducedMotion();
  const fitScale = makeFitScale(font);
  const groups = new Map<string, { gx: number; gz: number }[]>();
  punches.clear();

  for (let z = 0; z < dungeon.height; z++) {
    for (let x = 0; x < dungeon.width; x++) {
      const ch = charAt(dungeon, x, z);
      if (!shouldDraw(ch)) continue;
      const draw = ch === "^" || ch === "'" || ch === ":" ? "." : ch;
      let list = groups.get(draw);
      if (!list) {
        list = [];
        groups.set(draw, list);
      }
      list.push({ gx: x, gz: z });
    }
  }

  const meshes = new Map<string, InstancedMesh>();
  const instances: GlyphInstance[] = [];
  const byCell = new Map<string, GlyphInstance>();
  const materials = new Map<string, MeshStandardMaterial>();
  const extras: Mesh[] = [];
  const visOf = new Map<string, "hidden" | "memory" | "visible">();

  let floorGeo: BufferGeometry | null = null;
  let floorMat: MeshStandardMaterial | null = null;

  for (const [ch, cells] of groups) {
    const style = tileStyle(ch);
    const geo = makeGlyphGeometry(font, ch, fitScale);
    const mat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: style.roughness,
      metalness: style.metalness,
      emissive: style.emissive,
      emissiveIntensity: style.emissive ? 0.55 : 0,
    });
    materials.set(ch, mat);
    const mesh = new InstancedMesh(geo, mat, cells.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const colorArr = new Float32Array(cells.length * 3);
    mesh.instanceColor = new InstancedBufferAttribute(colorArr, 3);
    scene.add(mesh);
    meshes.set(ch, mesh);
    if (ch === ".") {
      floorGeo = geo;
      floorMat = mat;
    }

    const base = new Color(style.color);
    cells.forEach((cell, index) => {
      const inst: GlyphInstance = {
        char: ch,
        index,
        gx: cell.gx,
        gz: cell.gz,
        baseY: 0,
        yScale: style.yScale,
        sizeMul: style.sizeMul,
        phase: (cell.gx * 1.7 + cell.gz * 2.3) * 0.37,
        mesh,
        color: base.clone(),
      };
      instances.push(inst);
      byCell.set(cellKey(cell.gx, cell.gz), inst);
      visOf.set(cellKey(cell.gx, cell.gz), "visible");
      writeInstance(inst, reduced ? 0 : inst.baseY + BOOT_DROP, FACE_YAW, "visible");
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  const waterMat = materials.get("~");
  const emberMat = materials.get("=");

  let booting = !reduced;
  let spawnX = dungeon.spawn.x;
  let spawnZ = dungeon.spawn.z;
  let bootTime0 = 0;
  let bootClockSet = false;

  const visAt = (x: number, z: number): "hidden" | "memory" | "visible" =>
    visOf.get(cellKey(x, z)) ?? "hidden";

  const update = (time: number) => {
    if (!bootClockSet) {
      bootTime0 = time;
      bootClockSet = true;
    }
    const local = time - bootTime0;
    let matrixDirty = false;

    if (booting) {
      let remaining = 0;
      for (const inst of instances) {
        const vis = visAt(inst.gx, inst.gz);
        if (vis === "hidden") {
          writeInstance(inst, inst.baseY, FACE_YAW, vis);
          continue;
        }
        const dist =
          Math.abs(inst.gx - spawnX) + Math.abs(inst.gz - spawnZ);
        const delay = dist * 0.032;
        const t = easeOutCubic((local - delay) / BOOT_DURATION);
        if (t < 1) remaining += 1;
        const y = inst.baseY + BOOT_DROP * (1 - t);
        writeInstance(inst, y, FACE_YAW, vis);
      }
      matrixDirty = true;
      if (remaining === 0) booting = false;
    } else {
      for (const inst of instances) {
        const vis = visAt(inst.gx, inst.gz);
        if (vis === "hidden") continue;
        if ((inst.char === "~" || inst.char === "=") && vis === "visible") {
          const y = inst.baseY + Math.sin(time * 1.7 + inst.phase) * 0.055;
          writeInstance(inst, y, FACE_YAW, vis);
          matrixDirty = true;
        }
      }
    }

    if (punches.size > 0) {
      for (const [key, amount] of [...punches.entries()]) {
        const inst = byCell.get(key);
        const vis = inst ? visAt(inst.gx, inst.gz) : "hidden";
        const next = amount * 0.72;
        if (!inst || next < 0.01) {
          punches.delete(key);
          if (inst) writeInstance(inst, inst.baseY, FACE_YAW, vis);
          continue;
        }
        punches.set(key, next);
        writeInstance(inst, inst.baseY - next * 0.09, FACE_YAW, vis);
        matrixDirty = true;
      }
    }

    if (waterMat) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.35);
      waterMat.color.setHex(0xffffff);
      waterMat.emissiveIntensity = 0.25 + pulse * 0.2;
    }
    if (emberMat) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.1);
      emberMat.emissiveIntensity = 0.4 + pulse * 0.35;
    }

    if (matrixDirty) {
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };

  const punchFloor = (gx: number, gz: number) => {
    if (reduced) return;
    const inst = byCell.get(cellKey(gx, gz));
    if (!inst || inst.char !== ".") return;
    punches.set(cellKey(gx, gz), 1);
  };

  const applyFov = (visible: Set<string>, seen: boolean[][]) => {
    for (const inst of instances) {
      const k = cellKey(inst.gx, inst.gz);
      let vis: "hidden" | "memory" | "visible" = "hidden";
      if (visible.has(k)) vis = "visible";
      else if (seen[inst.gz]?.[inst.gx]) vis = "memory";
      visOf.set(k, vis);
      writeInstance(inst, inst.baseY, FACE_YAW, vis);
    }
    for (const mesh of meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  const hideCell = (x: number, z: number) => {
    const inst = byCell.get(cellKey(x, z));
    if (!inst) return;
    visOf.set(cellKey(x, z), "hidden");
    writeInstance(inst, inst.baseY, FACE_YAW, "hidden");
    inst.mesh.instanceMatrix.needsUpdate = true;
    if (inst.mesh.instanceColor) inst.mesh.instanceColor.needsUpdate = true;
  };

  const showFloorAt = (x: number, z: number) => {
    if (!floorGeo) return;
    const mat =
      floorMat?.clone() ??
      new MeshStandardMaterial({
        color: tileStyle(".").color,
        roughness: 0.62,
        metalness: 0.08,
      });
    const mesh = new Mesh(floorGeo, mat);
    const style = tileStyle(".");
    const p = worldPos(x, z);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = FACE_YAW;
    mesh.scale.set(style.sizeMul, style.yScale, style.sizeMul);
    scene.add(mesh);
    extras.push(mesh);
  };

  const retint = () => {
    for (const inst of instances) {
      const style = tileStyle(inst.char);
      inst.color.setHex(style.color);
      writeInstance(inst, inst.baseY, FACE_YAW, visAt(inst.gx, inst.gz));
    }
    for (const mesh of meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const floorStyle = tileStyle(".");
    for (const extra of extras) {
      const mat = extra.material;
      if (!Array.isArray(mat) && "color" in mat) {
        (mat as MeshStandardMaterial).color.setHex(floorStyle.color);
      }
    }
    if (waterMat) {
      const st = tileStyle("~");
      waterMat.emissive.setHex(st.emissive);
    }
    if (emberMat) {
      const st = tileStyle("=");
      emberMat.emissive.setHex(st.emissive);
    }
  };

  const resetBoot = (sx: number, sz: number) => {
    spawnX = sx;
    spawnZ = sz;
    booting = !prefersReducedMotion();
    bootClockSet = false;
  };

  const dispose = () => {
    for (const mesh of meshes.values()) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    for (const extra of extras) {
      scene.remove(extra);
      const mat = extra.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    meshes.clear();
    instances.length = 0;
    byCell.clear();
    extras.length = 0;
    punches.clear();
  };

  return {
    meshes,
    instances,
    byCell,
    update,
    punchFloor,
    applyFov,
    hideCell,
    showFloorAt,
    resetBoot,
    retint,
    dispose,
  };
}
