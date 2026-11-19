import { MinecraftModelViewer } from "./viewer/MinecraftModelViewer";
import type { ViewerOptions } from "./viewer/MinecraftModelViewer";

export { MinecraftModelViewer };
export type {
  ViewerOptions,
  ModelInfo,
  ModelKind,
  SkinOptions,
  BedrockLoadOptions,
} from "./viewer/MinecraftModelViewer";

export { buildBedrockModel, bedrockQuaternion } from "./bedrock/buildModel";
export { parseBedrockGeometry, isBedrockGeometry } from "./bedrock/parseGeometry";
export type { ParsedGeometry, ParsedBone, ParsedCube } from "./bedrock/types";

export { parseAnimations } from "./animation/parseAnimation";
export type { AnimationDef } from "./animation/parseAnimation";
export { AnimationPlayer } from "./animation/AnimationPlayer";
export { MolangExpression, compileMolang } from "./animation/molang";

export { buildSkinModel } from "./skin/buildSkin";
export { detectSlimSkin, expandLegacySkin } from "./skin/detectSlim";

export { loadModelPackage, loadModelPackageFromFiles, isEncryptedYsm } from "./ysm/loadPackage";
export type { PackageData } from "./ysm/loadPackage";
export { YsmEncryptedError, JavaModelJsonError } from "./ysm/errors";
export { imageBytesToCanvas, imageUrlToCanvas, canvasToTexture } from "./util/image";

export function createViewer(options: ViewerOptions = {}) {
  return new MinecraftModelViewer(options);
}
