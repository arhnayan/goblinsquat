import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
} from "three";
import type { ItemRarity, WeaponVisualType } from "./catalog";
import { getColors } from "./theme";

export type WeaponVisual = {
  group: Group;
  materials: MeshStandardMaterial[];
  dispose: () => void;
};

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

function tintFor(
  rarity: ItemRarity | undefined,
  baseColor: number,
): { color: number; emissive: number; emissiveIntensity: number } {
  const gold = getColors().gold;
  if (rarity === "mastercraft") {
    return { color: mixHex(baseColor, gold, 0.55), emissive: gold, emissiveIntensity: 0.5 };
  }
  if (rarity === "fine") {
    return { color: mixHex(baseColor, gold, 0.28), emissive: gold, emissiveIntensity: 0.22 };
  }
  return { color: baseColor, emissive: 0, emissiveIntensity: 0 };
}

function extrudeThin(shape: Shape, depth: number): ExtrudeGeometry {
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.4,
    bevelSize: depth * 0.35,
    bevelSegments: 1,
    curveSegments: 2,
  });
}

function bladeShape(length: number, width: number, guardWidth: number): Shape {
  const tipY = length;
  const shoulderY = length * 0.62;
  const gripTopY = -length * 0.16;
  const pommelY = -length * 0.3;
  const hw = width / 2;
  const ghw = guardWidth / 2;
  const grw = width * 0.3;
  const s = new Shape();
  s.moveTo(0, tipY);
  s.lineTo(hw, shoulderY);
  s.lineTo(ghw, shoulderY * 0.9);
  s.lineTo(ghw, shoulderY * 0.78);
  s.lineTo(grw, gripTopY);
  s.lineTo(grw, pommelY);
  s.lineTo(-grw, pommelY);
  s.lineTo(-grw, gripTopY);
  s.lineTo(-ghw, shoulderY * 0.78);
  s.lineTo(-ghw, shoulderY * 0.9);
  s.lineTo(-hw, shoulderY);
  s.closePath();
  return s;
}

function axeHeadShape(): Shape {
  const s = new Shape();
  s.moveTo(0, 0.1);
  s.lineTo(0.03, 0.15);
  s.quadraticCurveTo(0.24, 0.2, 0.21, 0.01);
  s.quadraticCurveTo(0.21, -0.13, 0.05, -0.08);
  s.lineTo(0, -0.02);
  s.closePath();
  return s;
}

function spearHeadShape(): Shape {
  const s = new Shape();
  s.moveTo(0, 0.18);
  s.lineTo(0.045, 0.06);
  s.lineTo(0, -0.05);
  s.lineTo(-0.045, 0.06);
  s.closePath();
  return s;
}

function buildBlade(long: boolean): { group: Group; meshes: Mesh[] } {
  const shape = long
    ? bladeShape(0.62, 0.09, 0.22)
    : bladeShape(0.34, 0.1, 0.17);
  const geo = extrudeThin(shape, long ? 0.045 : 0.05);
  const mesh = new Mesh(geo);
  const group = new Group();
  group.add(mesh);
  return { group, meshes: [mesh] };
}

function buildAxe(): { group: Group; meshes: Mesh[] } {
  const handleGeo = new CylinderGeometry(0.02, 0.024, 0.55, 5);
  const handle = new Mesh(handleGeo);
  handle.position.y = 0.05;
  const headGeo = extrudeThin(axeHeadShape(), 0.05);
  const head = new Mesh(headGeo);
  head.position.set(0.01, 0.18, -0.025);
  const group = new Group();
  group.add(handle, head);
  return { group, meshes: [handle, head] };
}

function buildMace(): { group: Group; meshes: Mesh[] } {
  const handleGeo = new CylinderGeometry(0.02, 0.024, 0.5, 5);
  const handle = new Mesh(handleGeo);
  handle.position.y = 0.02;
  const headGeo = new IcosahedronGeometry(0.1, 0);
  const head = new Mesh(headGeo);
  head.position.y = 0.29;
  const group = new Group();
  group.add(handle, head);
  return { group, meshes: [handle, head] };
}

function buildSpear(): { group: Group; meshes: Mesh[] } {
  const shaftGeo = new CylinderGeometry(0.016, 0.02, 0.8, 5);
  const shaft = new Mesh(shaftGeo);
  shaft.position.y = 0.02;
  const headGeo = extrudeThin(spearHeadShape(), 0.035);
  const head = new Mesh(headGeo);
  head.position.set(0, 0.42, -0.017);
  const group = new Group();
  group.add(shaft, head);
  return { group, meshes: [shaft, head] };
}

function buildBow(): { group: Group; meshes: Mesh[] } {
  const radius = 0.17;
  const tube = 0.014;
  const arc = Math.PI * 1.4;
  const bowGeo = new TorusGeometry(radius, tube, 4, 8, arc);
  const bow = new Mesh(bowGeo);
  bow.rotation.z = -arc / 2;
  const tipX = radius * Math.cos(arc / 2);
  const tipY = radius * Math.sin(arc / 2);
  const stringGeo = new CylinderGeometry(0.006, 0.006, tipY * 2, 4);
  const string = new Mesh(stringGeo);
  string.position.set(tipX, 0, 0);
  const group = new Group();
  group.add(bow, string);
  return { group, meshes: [bow, string] };
}

function buildShape(type: WeaponVisualType): { group: Group; meshes: Mesh[] } {
  switch (type) {
    case "sword":
      return buildBlade(true);
    case "dagger":
      return buildBlade(false);
    case "axe":
      return buildAxe();
    case "mace":
      return buildMace();
    case "spear":
      return buildSpear();
    case "bow":
      return buildBow();
  }
}

export function buildWeaponVisual(
  type: WeaponVisualType,
  rarity: ItemRarity | undefined,
  baseColor: number,
): WeaponVisual {
  const { group, meshes } = buildShape(type);
  const tint = tintFor(rarity, baseColor);
  const material = new MeshStandardMaterial({
    color: tint.color,
    emissive: tint.emissive,
    emissiveIntensity: tint.emissiveIntensity,
    roughness: 0.42,
    metalness: 0.3,
  });
  for (const m of meshes) m.material = material;
  return {
    group,
    materials: [material],
    dispose: () => {
      for (const m of meshes) m.geometry.dispose();
      material.dispose();
    },
  };
}

export function retintWeaponVisual(
  visual: WeaponVisual,
  rarity: ItemRarity | undefined,
  baseColor: number,
): void {
  const tint = tintFor(rarity, baseColor);
  for (const m of visual.materials) {
    m.color.setHex(tint.color);
    m.emissive.setHex(tint.emissive);
    m.emissiveIntensity = tint.emissiveIntensity;
  }
}
