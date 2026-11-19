import { strFromU8, unzipSync } from "fflate";
import { imageBytesToCanvas, LoadedImage } from "../util/image";
import { JavaModelJsonError, YsmEncryptedError } from "./errors";

export interface PackageData {
  name: string;
  geometryJson: any;
  animations: any[];
  textures: LoadedImage[];
  textureNames: string[];
  defaultTextureIndex: number;
  previewAnimation?: string;
  metadata: Record<string, any>;
  heightScale: number;
  widthScale: number;
  format: "ysm-json" | "legacy";
  sourcePath?: string;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function baseName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function dirName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function withoutExtension(name: string): string {
  return name.replace(/\.(json|png)$/i, "");
}

function decodeJson(data: Uint8Array): any {
  return JSON.parse(strFromU8(data));
}

function isGeometryJson(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value["minecraft:geometry"])) return true;
  if (value["minecraft:geometry"] && Array.isArray(value["minecraft:geometry"].bones)) return true;
  if (value.geometry) return true;
  return Array.isArray(value.bones);
}

function isAnimationJson(value: any): boolean {
  return Boolean(value && typeof value === "object" && value.animations);
}

function isJavaBlockModel(value: any): boolean {
  return Boolean(value && typeof value === "object" && Array.isArray(value.elements) && value.textures);
}

function findFile(paths: string[], wanted: string | undefined): string | undefined {
  if (!wanted) return undefined;
  const normalized = normalizePath(wanted);
  if (paths.includes(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const insensitive = paths.find((p) => normalizePath(p).toLowerCase() === lower);
  if (insensitive) return insensitive;

  const wantedBase = baseName(normalized).toLowerCase();
  const byBase = paths
    .filter((p) => baseName(p).toLowerCase() === wantedBase)
    .sort((a, b) => normalizePath(a).split("/").length - normalizePath(b).split("/").length);
  return byBase[0];
}

function extractYsmName(bytes: Uint8Array): string | undefined {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.slice(0, Math.min(bytes.length, 4096)),
  );
  const match = text.match(/<name>\s*([^\r\n<]+)/);
  return match?.[1]?.trim();
}

export function isEncryptedYsm(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const header = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4));
  return header === "YSGP";
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function clampScale(value: unknown): number {
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(Math.max(scale, 0.1), 10);
}

export async function loadModelPackage(
  bytes: Uint8Array,
  fallbackName = "未命名模型",
): Promise<PackageData> {
  if (isEncryptedYsm(bytes)) {
    throw new YsmEncryptedError(extractYsmName(bytes));
  }
  if (!isZip(bytes)) {
    throw new Error("无法识别的模型包：既不是 .ysm（加密）也不是 .zip 压缩包");
  }

  const entries = unzipSync(bytes);
  return loadPackageEntries(entries, fallbackName);
}

async function loadPackageEntries(
  entries: Record<string, Uint8Array>,
  fallbackName: string,
): Promise<PackageData> {
  const filePaths = Object.keys(entries)
    .filter((path) => !path.endsWith("/") && entries[path].length > 0)
    .map(normalizePath);

  if (filePaths.length === 0) throw new Error("模型包为空");

  const ysmJsonPath = filePaths
    .filter((path) => baseName(path).toLowerCase() === "ysm.json")
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];

  let manifest: any = null;
  if (ysmJsonPath) {
    try {
      manifest = decodeJson(entries[ysmJsonPath]);
    } catch {
      manifest = null;
    }
  }

  const player = manifest?.files?.player ?? {};
  const properties = manifest?.properties ?? {};

  let geometryPath: string | undefined = findFile(filePaths, player?.model?.main);

  if (!geometryPath) {
    const geometryFiles = filePaths
      .filter((path) => path.toLowerCase().endsWith(".json"))
      .filter((path) => {
        try {
          return isGeometryJson(decodeJson(entries[path]));
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        const aMain = baseName(a).toLowerCase() === "main.json" ? 0 : 1;
        const bMain = baseName(b).toLowerCase() === "main.json" ? 0 : 1;
        if (aMain !== bMain) return aMain - bMain;
        return a.split("/").length - b.split("/").length;
      });
    geometryPath = geometryFiles[0];
  }

  if (!geometryPath) {
    // Give a precise error for Java block models.
    for (const path of filePaths.filter((p) => p.toLowerCase().endsWith(".json"))) {
      try {
        if (isJavaBlockModel(decodeJson(entries[path]))) throw new JavaModelJsonError();
      } catch (error) {
        if (error instanceof JavaModelJsonError) throw error;
      }
    }
    throw new Error("模型包中没有找到基岩版几何文件（minecraft:geometry）");
  }

  const geometryJson = decodeJson(entries[geometryPath]);

  // Animations
  const animationPaths: string[] = [];
  const manifestAnimation = player?.animation;
  if (manifestAnimation && typeof manifestAnimation === "object") {
    for (const [key, value] of Object.entries<any>(manifestAnimation)) {
      if (key === "arm" || key === "fp_arm") continue;
      if (typeof value === "string") {
        const resolved = findFile(filePaths, value);
        if (resolved) animationPaths.push(resolved);
      }
    }
  }

  if (animationPaths.length === 0) {
    for (const path of filePaths) {
      if (!path.toLowerCase().endsWith(".json")) continue;
      try {
        if (isAnimationJson(decodeJson(entries[path]))) animationPaths.push(path);
      } catch {
        /* ignore */
      }
    }
  }

  const animations: any[] = [];
  const seen = new Set<string>();
  for (const path of animationPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      animations.push(decodeJson(entries[path]));
    } catch {
      /* ignore malformed animation file */
    }
  }

  // Textures
  const texturePaths: string[] = [];
  const rawTexture = player?.texture;
  const textureEntries = Array.isArray(rawTexture) ? rawTexture : rawTexture ? [rawTexture] : [];
  for (const entry of textureEntries) {
    const wanted = typeof entry === "string" ? entry : entry?.uv;
    const resolved = findFile(filePaths, wanted);
    if (resolved && resolved.toLowerCase().endsWith(".png")) texturePaths.push(resolved);
  }
  if (texturePaths.length === 0) {
    for (const path of filePaths) {
      if (!path.toLowerCase().endsWith(".png")) continue;
      // Skip avatar/preview art when we can.
      const lower = normalizePath(path).toLowerCase();
      if (lower.includes("avatar/") || lower.includes("gui/")) continue;
      texturePaths.push(path);
    }
  }

  // Keep the order declared in ysm.json, and prefer the configured default texture.
  const uniqueTexturePaths = [...new Set(texturePaths)];
  const defaultTextureName =
    typeof properties.default_texture === "string" ? properties.default_texture.toLowerCase() : null;

  let defaultTextureIndex = 0;
  if (defaultTextureName) {
    const index = uniqueTexturePaths.findIndex(
      (path) => withoutExtension(baseName(path)).toLowerCase() === defaultTextureName,
    );
    if (index >= 0) defaultTextureIndex = index;
  }

  const textures: LoadedImage[] = [];
  const textureNames: string[] = [];
  for (const path of uniqueTexturePaths.slice(0, 16)) {
    try {
      textures.push(await imageBytesToCanvas(entries[path]));
      textureNames.push(withoutExtension(baseName(path)));
    } catch {
      /* skip broken texture */
    }
  }

  const name =
    manifest?.metadata?.name ||
    (ysmJsonPath ? baseName(dirName(ysmJsonPath)) : "") ||
    fallbackName;

  return {
    name,
    geometryJson,
    animations,
    textures,
    textureNames,
    defaultTextureIndex: Math.min(defaultTextureIndex, Math.max(0, textures.length - 1)),
    previewAnimation:
      typeof properties.preview_animation === "string" ? properties.preview_animation : undefined,
    metadata: manifest?.metadata ?? {},
    heightScale: clampScale(properties.height_scale),
    widthScale: clampScale(properties.width_scale),
    format: manifest ? "ysm-json" : "legacy",
    sourcePath: geometryPath,
  };
}

/**
 * Loads a YSM package from a set of files (folder structure), e.g. from an
 * <input webkitdirectory> or a whole-folder drop. Paths are taken from
 * webkitRelativePath when available, with basename fallback for flat lists.
 */
export async function loadModelPackageFromFiles(
  files: File[],
  fallbackName = "未命名模型",
): Promise<PackageData> {
  if (files.length === 0) throw new Error("没有选择文件");
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    entries[normalizePath(relative || file.name)] = new Uint8Array(await file.arrayBuffer());
  }
  return loadPackageEntries(entries, fallbackName);
}
