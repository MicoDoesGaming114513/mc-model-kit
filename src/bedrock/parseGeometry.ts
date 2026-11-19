import type {
  CubeFaceUV,
  FaceName,
  ParsedBone,
  ParsedCube,
  ParsedGeometry,
  Vec3,
} from "./types";

const FACE_NAMES: FaceName[] = ["east", "south", "west", "north", "up", "down"];

function vec3(value: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(value) && value.length >= 3) {
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return [Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0];
  }
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function parseCube(raw: any, boneInflate: number, boneMirror: boolean): ParsedCube | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw === "string") return null;

  const size = vec3(raw.size, [0, 0, 0]);
  if (size[0] === 0 && size[1] === 0 && size[2] === 0) {
    return null;
  }

  const cube: ParsedCube = {
    origin: vec3(raw.origin, [0, 0, 0]),
    size,
    inflate: raw.inflate === undefined ? boneInflate : num(raw.inflate, boneInflate),
    mirror: raw.mirror === undefined ? boneMirror : bool(raw.mirror),
    rotation: raw.rotation === undefined ? undefined : vec3(raw.rotation),
    pivot: raw.pivot === undefined ? undefined : vec3(raw.pivot),
  };

  const uv = raw.uv;
  if (Array.isArray(uv)) {
    cube.boxUV = [num(uv[0]), num(uv[1])];
  } else if (uv && typeof uv === "object") {
    const faceUV: Partial<Record<FaceName, CubeFaceUV>> = {};
    for (const face of FACE_NAMES) {
      const entry = uv[face];
      if (!entry || typeof entry !== "object") continue;
      if (!Array.isArray(entry.uv)) continue;
      faceUV[face] = {
        uv: [num(entry.uv[0]), num(entry.uv[1])],
        uvSize: Array.isArray(entry.uv_size)
          ? [num(entry.uv_size[0]), num(entry.uv_size[1])]
          : undefined,
      };
    }
    if (Object.keys(faceUV).length > 0) cube.faceUV = faceUV;
  }

  if (!cube.boxUV && !cube.faceUV) {
    // No UV at all: treat as box UV at 0,0 so the model is still visible.
    cube.boxUV = [0, 0];
  }

  return cube;
}

function parseBone(raw: any): ParsedBone | null {
  if (!raw || typeof raw !== "object" || typeof raw.name !== "string") return null;
  const boneInflate = num(raw.inflate, 0);
  const boneMirror = bool(raw.mirror);
  const cubes: ParsedCube[] = [];
  if (Array.isArray(raw.cubes)) {
    for (const c of raw.cubes) {
      const cube = parseCube(c, boneInflate, boneMirror);
      if (cube) cubes.push(cube);
    }
  }
  return {
    name: raw.name,
    parent: typeof raw.parent === "string" ? raw.parent : undefined,
    pivot: vec3(raw.pivot, [0, 0, 0]),
    rotation: vec3(raw.rotation, [0, 0, 0]),
    inflate: boneInflate,
    mirror: boneMirror,
    cubes,
  };
}

function pickGeometryRoot(json: any): any {
  if (!json || typeof json !== "object") return null;

  // 1.12.0 / 1.16.0
  if (Array.isArray(json["minecraft:geometry"])) {
    return json["minecraft:geometry"].find((g: any) => g && Array.isArray(g.bones)) ?? null;
  }
  if (json["minecraft:geometry"] && Array.isArray(json["minecraft:geometry"].bones)) {
    return json["minecraft:geometry"];
  }

  // 1.8.0
  if (json.geometry) {
    if (Array.isArray(json.geometry)) {
      return json.geometry.find((g: any) => g && Array.isArray(g.bones)) ?? null;
    }
    if (Array.isArray(json.geometry.bones)) return json.geometry;
  }

  // 1.8.0 exports the geometry under "geometry.<identifier>" instead of "geometry".
  for (const key of Object.keys(json)) {
    const value = json[key];
    if (key.startsWith("geometry.") && value && Array.isArray(value.bones)) return value;
  }

  // bare geometry object
  if (Array.isArray(json.bones)) return json;

  return null;
}

export function isBedrockGeometry(json: any): boolean {
  return pickGeometryRoot(json) !== null;
}

export function parseBedrockGeometry(json: any): ParsedGeometry {
  // Some exporters wrap the geometry in an array of documents.
  if (Array.isArray(json)) {
    for (const entry of json) {
      if (isBedrockGeometry(entry)) return parseBedrockGeometry(entry);
    }
    throw new Error("JSON 中没有找到基岩版几何数据（minecraft:geometry / geometry）");
  }

  const root = pickGeometryRoot(json);
  if (!root) {
    throw new Error("JSON 中没有找到基岩版几何数据（minecraft:geometry / geometry）");
  }

  const description = root.description ?? {};
  const textureWidth = num(
    description.texture_width ?? root.texturewidth ?? root.texture_width,
    64,
  );
  const textureHeight = num(
    description.texture_height ?? root.textureheight ?? root.texture_height,
    64,
  );

  const bones: ParsedBone[] = [];
  const rawBones = Array.isArray(root.bones) ? root.bones : [];
  for (const rawBone of rawBones) {
    const bone = parseBone(rawBone);
    if (bone) bones.push(bone);
  }

  if (bones.length === 0) {
    throw new Error("几何文件中没有任何骨骼（bones）");
  }

  return {
    identifier:
      description.identifier ??
      root.name ??
      root["minecraft:geometry"] ??
      "geometry.unknown",
    textureWidth,
    textureHeight,
    formatVersion: String(json.format_version ?? "1.12.0"),
    bones,
  };
}
