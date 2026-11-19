import * as THREE from "three";
import type { FaceName, ParsedCube, ParsedGeometry, Vec3 } from "./types";

export interface BoneNode {
  name: string;
  group: THREE.Group;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  baseQuaternion: THREE.Quaternion;
}

export interface BuiltModel {
  root: THREE.Group;
  bones: Map<string, BoneNode>;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  cubeCount: number;
  textureWidth: number;
  textureHeight: number;
  identifier: string;
}

const PIXEL = 1 / 16;

/** Compose an X-then-Y-then-Z rotation (Bedrock convention). */
export function bedrockQuaternion(rotation: Vec3, target = new THREE.Quaternion()): THREE.Quaternion {
  const rx = THREE.MathUtils.degToRad(rotation[0]);
  const ry = THREE.MathUtils.degToRad(rotation[1]);
  const rz = THREE.MathUtils.degToRad(rotation[2]);
  const m = new THREE.Matrix4()
    .makeRotationZ(rz)
    .multiply(new THREE.Matrix4().makeRotationY(ry))
    .multiply(new THREE.Matrix4().makeRotationX(rx));
  return target.setFromRotationMatrix(m);
}

function faceQuad(
  min: Vec3,
  max: Vec3,
  face: FaceName,
): [Vec3, Vec3, Vec3, Vec3] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  switch (face) {
    case "south":
      return [
        [x0, y1, z1],
        [x1, y1, z1],
        [x0, y0, z1],
        [x1, y0, z1],
      ];
    case "north":
      return [
        [x1, y1, z0],
        [x0, y1, z0],
        [x1, y0, z0],
        [x0, y0, z0],
      ];
    case "east":
      return [
        [x1, y1, z1],
        [x1, y1, z0],
        [x1, y0, z1],
        [x1, y0, z0],
      ];
    case "west":
      return [
        [x0, y1, z0],
        [x0, y1, z1],
        [x0, y0, z0],
        [x0, y0, z1],
      ];
    case "up":
      return [
        [x0, y1, z0],
        [x1, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
      ];
    case "down":
      return [
        [x0, y0, z1],
        [x1, y0, z1],
        [x0, y0, z0],
        [x1, y0, z0],
      ];
  }
}

interface Rect {
  u1: number;
  v1: number;
  u2: number;
  v2: number;
}

function boxUVRect(cube: ParsedCube, face: FaceName): Rect | null {
  if (!cube.boxUV) return null;
  const [u, v] = cube.boxUV;
  const w = Math.abs(cube.size[0]);
  const h = Math.abs(cube.size[1]);
  const d = Math.abs(cube.size[2]);

  switch (face) {
    case "east":
      return { u1: u, v1: v + d, u2: u + d, v2: v + d + h };
    case "west":
      return { u1: u + d + w, v1: v + d, u2: u + 2 * d + w, v2: v + d + h };
    case "north":
      return { u1: u + d, v1: v + d, u2: u + d + w, v2: v + d + h };
    case "south":
      return { u1: u + d + w + d, v1: v + d, u2: u + d + w + d + w, v2: v + d + h };
    case "up":
      return { u1: u + d, v1: v, u2: u + d + w, v2: v + d };
    case "down":
      return { u1: u + w + d, v1: v, u2: u + w + 2 * d, v2: v + d };
  }
}

function perFaceRect(cube: ParsedCube, face: FaceName): Rect | null {
  const entry = cube.faceUV?.[face];
  if (!entry) return null;
  const [u, v] = entry.uv;
  const w = Math.abs(cube.size[0]);
  const h = Math.abs(cube.size[1]);
  const d = Math.abs(cube.size[2]);
  const defaultSize: [number, number] =
    face === "up" || face === "down" ? [w, d] : face === "east" || face === "west" ? [d, h] : [w, h];
  const [uw, uh] = entry.uvSize ?? defaultSize;
  return { u1: u, v1: v, u2: u + uw, v2: v + uh };
}

function cubeBounds(cube: ParsedCube): { min: Vec3; max: Vec3 } {
  const origin = cube.origin;
  const size = cube.size;
  const inflate = cube.inflate;
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = origin[i];
    const b = origin[i] + size[i];
    min[i] = Math.min(a, b) - inflate;
    max[i] = Math.max(a, b) + inflate;
  }
  return { min, max };
}

interface CubeBuildOptions {
  bonePivot: Vec3;
  textureWidth: number;
  textureHeight: number;
  headSubtree?: boolean;
  mirror?: boolean;
}

function appendCube(
  cube: ParsedCube,
  opts: CubeBuildOptions,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): void {
  const mirror = opts.mirror === true;
  let { min, max } = cubeBounds(cube);
  if (mirror) {
    const rawMin = min, rawMax = max;
    min = [-rawMax[0], rawMin[1], rawMin[2]];
    max = [-rawMin[0], rawMax[1], rawMax[2]];
  }

  const center: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const rawBonePivot: Vec3 = mirror ? [-opts.bonePivot[0], opts.bonePivot[1], opts.bonePivot[2]] : opts.bonePivot;
  let rawCubePivot: Vec3 | undefined = cube.pivot
    ? (mirror ? [-cube.pivot[0], cube.pivot[1], cube.pivot[2]] : cube.pivot)
    : undefined;
  const pivot = (globalThis as any).__MC_BONE_PIVOT ? rawBonePivot : ((globalThis as any).__MC_CENTER_PIVOT ? center : (rawCubePivot ?? center));
  let rotation = (globalThis as any).__MC_NO_CUBE_ROT ? undefined : cube.rotation;
  if (mirror && rotation) rotation = [-rotation[0], -rotation[1], rotation[2]];
  if ((globalThis as any).__MC_HYBRID && !opts.headSubtree) rotation = undefined;
  if ((globalThis as any).__MC_HEAD_NO_CUBE && opts.headSubtree) rotation = undefined;
  const pivotLimit = (globalThis as any).__MC_PIVOT_LIMIT;
  if (rotation && cube.pivot && typeof pivotLimit === "number") {
    const dx = center[0] - pivot[0], dy = center[1] - pivot[1], dz = center[2] - pivot[2];
    if (Math.sqrt(dx*dx+dy*dy+dz*dz) > pivotLimit) rotation = undefined;
  }
  let rotationMatrix: THREE.Matrix4 | null = null;
  if (rotation && (rotation[0] || rotation[1] || rotation[2])) {
    const rx = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(rotation[0]));
    const ry = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(rotation[1]));
    const rz = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(rotation[2]));
    const mode = (globalThis as any).__MC_CUBE_ROT_ORDER || "ZYX";
    rotationMatrix =
      mode === "XYZ" ? rx.multiply(ry).multiply(rz) :
      mode === "YXZ" ? ry.multiply(rx).multiply(rz) :
      mode === "ZXY" ? rz.multiply(rx).multiply(ry) :
      mode === "YZX" ? ry.multiply(rz).multiply(rx) :
      rz.multiply(ry).multiply(rx);
  }

  const transform = (p: Vec3): Vec3 => {
    let x = p[0];
    let y = p[1];
    let z = p[2];
    if (rotationMatrix) {
      const v = new THREE.Vector3(x - pivot[0], y - pivot[1], z - pivot[2]).applyMatrix4(
        rotationMatrix,
      );
      x = v.x + pivot[0];
      y = v.y + pivot[1];
      z = v.z + pivot[2];
    }
    if (cube.mirror) {
      x = 2 * center[0] - x;
    }
    return [x - rawBonePivot[0], y - rawBonePivot[1], z - rawBonePivot[2]];
  };

  const faceOrder: FaceName[] = ["east", "south", "west", "north", "up", "down"];

  for (const face of faceOrder) {
    const rect = perFaceRect(cube, face) ?? (cube.faceUV ? null : boxUVRect(cube, face));
    if (!rect) continue;

    const { u1, v1, u2, v2 } = rect;

    const quad = faceQuad(min, max, face);
    const transformed = quad.map(transform);

    // Compute the outward normal from the transformed triangle.
    const p0 = transformed[0];
    const p1 = transformed[1];
    const p2 = transformed[2];
    const e1 = new THREE.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const e2 = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const normal = e1.cross(e2).normalize();
    if (cube.mirror) normal.x = -normal.x;

    const base = positions.length / 3;
    for (const p of transformed) {
      positions.push(p[0], p[1], p[2]);
      normals.push(normal.x, normal.y, normal.z);
    }

    const tw = opts.textureWidth;
    const th = opts.textureHeight;
    const un1 = u1 / tw;
    const un2 = u2 / tw;
    const vn1 = 1 - v1 / th;
    const vn2 = 1 - v2 / th;
    // vertices are TL, TR, BL, BR
    uvs.push(un1, vn1, un2, vn1, un1, vn2, un2, vn2);

    if (cube.mirror) {
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    } else {
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
}

export interface BedrockBuildOptions {
  /** Mirror geometry on X like GeckoLib/Blockbench does. YSM models require this. */
  mirror?: boolean;
}

export function buildBedrockModel(
  doc: ParsedGeometry,
  texture: THREE.Texture,
  options: BedrockBuildOptions = {},
): BuiltModel {
  const root = new THREE.Group();
  const mirrorX = Boolean((globalThis as any).__MC_MIRROR_X) && options.mirror !== true;
  root.scale.set(mirrorX ? -PIXEL : PIXEL, PIXEL, PIXEL);
  root.name = `bedrock:${doc.identifier}`;

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    side: (globalThis as any).__MC_MIRROR_X ? THREE.DoubleSide : THREE.FrontSide,
  });
  material.name = "mc-cutout";

  const bones = new Map<string, BoneNode>();
  const groups = new Map<string, THREE.Group>();

  for (const bone of doc.bones) {
    const group = new THREE.Group();
    group.name = bone.name;
    groups.set(bone.name, group);
    bones.set(bone.name, {
      name: bone.name,
      group,
      basePosition: new THREE.Vector3(),
      baseRotation: new THREE.Euler(),
      baseQuaternion: new THREE.Quaternion(),
    });
  }

  const boneByName = new Map(doc.bones.map((b) => [b.name, b]));
  const underHead = new Set<string>();
  const isUnderHead = (name: string): boolean => {
    let current = boneByName.get(name);
    const seen = new Set<string>();
    while (current && !seen.has(current.name)) {
      if (current.name === "Head") return true;
      seen.add(current.name);
      current = current.parent ? boneByName.get(current.parent) : undefined;
    }
    return false;
  };
  for (const b of doc.bones) if (isUnderHead(b.name)) underHead.add(b.name);

  let cubeCount = 0;
  const geometries: THREE.BufferGeometry[] = [];

  for (const bone of doc.bones) {
    const group = groups.get(bone.name)!;
    const parentName = bone.parent && groups.has(bone.parent) ? bone.parent : null;
    const parentPivot: Vec3 = parentName
      ? doc.bones.find((b) => b.name === parentName)!.pivot
      : [0, 0, 0];

    const bp: Vec3 = options.mirror ? [-bone.pivot[0], bone.pivot[1], bone.pivot[2]] : bone.pivot;
    const pp: Vec3 = options.mirror ? [-parentPivot[0], parentPivot[1], parentPivot[2]] : parentPivot;
    group.position.set(
      bp[0] - pp[0],
      bp[1] - pp[1],
      bp[2] - pp[2],
    );
    const rot: Vec3 = options.mirror ? [-bone.rotation[0], -bone.rotation[1], bone.rotation[2]] : bone.rotation;
    group.quaternion.copy(
      (globalThis as any).__MC_NO_BONE_ROT ||
      ((globalThis as any).__MC_HYBRID && underHead.has(bone.name)) ||
      ((globalThis as any).__MC_INVERSE_HYBRID && !underHead.has(bone.name))
        ? new THREE.Quaternion()
        : bedrockQuaternion(rot),
    );

    const node = bones.get(bone.name)!;
    node.basePosition.copy(group.position);
    node.baseRotation.set(
      THREE.MathUtils.degToRad(rot[0]),
      THREE.MathUtils.degToRad(rot[1]),
      THREE.MathUtils.degToRad(rot[2]),
      "ZYX",
    );
    node.baseQuaternion.copy(group.quaternion);

    if (bone.cubes.length > 0) {
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (const cube of bone.cubes) {
        appendCube(
          cube,
          {
            bonePivot: bone.pivot,
            textureWidth: doc.textureWidth,
            textureHeight: doc.textureHeight,
            headSubtree: underHead.has(bone.name),
            mirror: options.mirror === true,
          },
          positions,
          normals,
          uvs,
          indices,
        );
        cubeCount++;
      }

      if (indices.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${bone.name}:mesh`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        geometries.push(geometry);
      }
    }
  }

  // Attach bone groups respecting the parent hierarchy.
  for (const bone of doc.bones) {
    const group = groups.get(bone.name)!;
    if (bone.parent && groups.has(bone.parent)) {
      groups.get(bone.parent)!.add(group);
    } else {
      root.add(group);
    }
  }

  return {
    root,
    bones,
    materials: [material],
    geometries,
    cubeCount,
    textureWidth: doc.textureWidth,
    textureHeight: doc.textureHeight,
    identifier: doc.identifier,
  };
}
