export type Vec3 = [number, number, number];

export type FaceName = "east" | "south" | "west" | "north" | "up" | "down";

export interface CubeFaceUV {
  uv: [number, number];
  uvSize?: [number, number];
}

export interface ParsedCube {
  origin: Vec3;
  size: Vec3;
  rotation?: Vec3;
  pivot?: Vec3;
  inflate: number;
  mirror: boolean;
  boxUV?: [number, number];
  faceUV?: Partial<Record<FaceName, CubeFaceUV>>;
}

export interface ParsedBone {
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation: Vec3;
  inflate: number;
  mirror: boolean;
  cubes: ParsedCube[];
}

export interface ParsedGeometry {
  identifier: string;
  textureWidth: number;
  textureHeight: number;
  formatVersion: string;
  bones: ParsedBone[];
}
