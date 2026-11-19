import * as THREE from "three";

export interface SkinModelOptions {
  slim: boolean;
  textureWidth: number;
  textureHeight: number;
}

export interface SkinModel {
  root: THREE.Group;
  parts: Record<"head" | "body" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg", THREE.Group>;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/**
 * Maps a box-UV region of a Minecraft skin onto a BoxGeometry.
 * The skin layout uses 64x64 texels; `scale` adapts it to HD skins.
 */
function setBoxUV(
  box: THREE.BoxGeometry,
  u: number,
  v: number,
  width: number,
  height: number,
  depth: number,
  textureWidth: number,
  textureHeight: number,
  scale: number,
): void {
  u *= scale;
  v *= scale;
  width *= scale;
  height *= scale;
  depth *= scale;

  const toFaceVertices = (x1: number, y1: number, x2: number, y2: number): THREE.Vector2[] => [
    new THREE.Vector2(x1 / textureWidth, 1 - y2 / textureHeight),
    new THREE.Vector2(x2 / textureWidth, 1 - y2 / textureHeight),
    new THREE.Vector2(x2 / textureWidth, 1 - y1 / textureHeight),
    new THREE.Vector2(x1 / textureWidth, 1 - y1 / textureHeight),
  ];

  const top = toFaceVertices(u + depth, v, u + width + depth, v + depth);
  const bottom = toFaceVertices(u + width + depth, v, u + width * 2 + depth, v + depth);
  const left = toFaceVertices(u, v + depth, u + depth, v + depth + height);
  const front = toFaceVertices(u + depth, v + depth, u + width + depth, v + depth + height);
  const right = toFaceVertices(u + width + depth, v + depth, u + width + depth * 2, v + height + depth);
  const back = toFaceVertices(
    u + width + depth * 2,
    v + depth,
    u + width * 2 + depth * 2,
    v + height + depth,
  );

  const uvRight = [right[3], right[2], right[0], right[1]];
  const uvLeft = [left[3], left[2], left[0], left[1]];
  const uvTop = [top[3], top[2], top[0], top[1]];
  const uvBottom = [bottom[0], bottom[1], bottom[3], bottom[2]];
  const uvFront = [front[3], front[2], front[0], front[1]];
  const uvBack = [back[3], back[2], back[0], back[1]];

  const data: number[] = [];
  for (const arr of [uvRight, uvLeft, uvTop, uvBottom, uvFront, uvBack]) {
    for (const uv of arr) data.push(uv.x, uv.y);
  }
  box.setAttribute("uv", new THREE.Float32BufferAttribute(data, 2));
}

interface PartOptions {
  name: string;
  size: [number, number, number];
  uv: [number, number];
  position: [number, number, number];
  pivot?: [number, number, number];
}

function createPart(
  options: PartOptions,
  innerMaterial: THREE.Material,
  outerMaterial: THREE.Material,
  textureWidth: number,
  textureHeight: number,
  scale: number,
  outerUv?: [number, number],
): THREE.Group {
  const { size, uv, position, pivot = [0, 0, 0] } = options;
  const group = new THREE.Group();
  group.name = options.name;
  group.position.set(position[0], position[1], position[2]);

  const innerGeometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  setBoxUV(innerGeometry, uv[0], uv[1], size[0], size[1], size[2], textureWidth, textureHeight, scale);
  const inner = new THREE.Mesh(innerGeometry, innerMaterial);
  inner.name = "inner";
  inner.castShadow = true;
  inner.receiveShadow = true;

  const pivotGroup = new THREE.Group();
  pivotGroup.position.set(pivot[0], pivot[1], pivot[2]);
  pivotGroup.add(inner);

  const outerSize: [number, number, number] = [size[0] + 0.5, size[1] + 0.5, size[2] + 0.5];
  const outerGeometry = new THREE.BoxGeometry(outerSize[0], outerSize[1], outerSize[2]);
  setBoxUV(
    outerGeometry,
    outerUv?.[0] ?? uv[0],
    outerUv?.[1] ?? uv[1],
    size[0],
    size[1],
    size[2],
    textureWidth,
    textureHeight,
    scale,
  );
  const outer = new THREE.Mesh(outerGeometry, outerMaterial);
  outer.name = "outer";
  outer.castShadow = false;
  outer.receiveShadow = false;
  pivotGroup.add(outer);

  group.add(pivotGroup);
  return group;
}

export function buildSkinModel(
  texture: THREE.Texture,
  options: SkinModelOptions,
): SkinModel {
  const { slim, textureWidth, textureHeight } = options;
  const scale = textureWidth / 64;

  const innerMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    side: THREE.FrontSide,
    transparent: false,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const outerMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.001,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const root = new THREE.Group();
  root.name = "skin";
  root.scale.setScalar(1 / 16);
  root.position.y = 24 / 16;

  const head = createPart(
    { name: "head", size: [8, 8, 8], uv: [0, 0], position: [0, 0, 0], pivot: [0, 0, 0] },
    innerMaterial,
    outerMaterial,
    textureWidth,
    textureHeight,
    scale,
    [32, 0],
  );
  // Head mesh is centered 4px above the neck.
  (head.children[0] as THREE.Group).position.set(0, 4, 0);

  const body = createPart(
    { name: "body", size: [8, 12, 4], uv: [16, 16], position: [0, -6, 0] },
    innerMaterial,
    outerMaterial,
    textureWidth,
    textureHeight,
    scale,
    [16, 32],
  );

  const rightArm = createPart(
    {
      name: "rightArm",
      size: [slim ? 3 : 4, 12, 4],
      uv: [40, 16],
      position: [-5, -2, 0],
      pivot: [slim ? -0.5 : -1, -4, 0],
    },
    innerMaterial,
    outerMaterial,
    textureWidth,
    textureHeight,
    scale,
    [40, 32],
  );

  const leftArm = createPart(
    {
      name: "leftArm",
      size: [slim ? 3 : 4, 12, 4],
      uv: [32, 48],
      position: [5, -2, 0],
      pivot: [slim ? 0.5 : 1, -4, 0],
    },
    innerMaterial,
    outerMaterial,
    textureWidth,
    textureHeight,
    scale,
    [48, 48],
  );

  const rightLeg = createPart(
    {
      name: "rightLeg",
      size: [4, 12, 4],
      uv: [0, 16],
      position: [-1.9, -12, -0.1],
      pivot: [0, -6, 0],
    },
    innerMaterial,
    outerMaterial,
    textureWidth,
    textureHeight,
    scale,
    [0, 32],
  );

  const leftLeg = createPart(
    {
      name: "leftLeg",
      size: [4, 12, 4],
      uv: [16, 48],
      position: [1.9, -12, -0.1],
      pivot: [0, -6, 0],
    },
    innerMaterial,
    outerMaterial,
    textureWidth,
    textureHeight,
    scale,
    [0, 48],
  );

  root.add(head, body, rightArm, leftArm, rightLeg, leftLeg);

  return {
    root,
    parts: { head, body, rightArm, leftArm, rightLeg, leftLeg },
    materials: [innerMaterial, outerMaterial],
    geometries: [],
  };
}
