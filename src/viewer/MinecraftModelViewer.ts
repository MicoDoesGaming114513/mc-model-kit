import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildBedrockModel, BuiltModel } from "../bedrock/buildModel";
import { isBedrockGeometry, parseBedrockGeometry } from "../bedrock/parseGeometry";
import { AnimationPlayer } from "../animation/AnimationPlayer";
import { AnimationDef, parseAnimations } from "../animation/parseAnimation";
import { buildSkinModel, SkinModel } from "../skin/buildSkin";
import { detectSlimSkin, expandLegacySkin } from "../skin/detectSlim";
import {
  canvasToTexture,
  createMissingTexture,
  imageBytesToCanvas,
  LoadedImage,
  textureFromLoadedImage,
} from "../util/image";
import { isEncryptedYsm, isZip, loadModelPackage, loadModelPackageFromFiles } from "../ysm/loadPackage";
import type { PackageData } from "../ysm/loadPackage";
import { JavaModelJsonError, YsmEncryptedError } from "../ysm/errors";

export type ModelKind = "bedrock" | "skin" | "ysm";

export interface ViewerOptions {
  canvas?: HTMLCanvasElement;
  container?: HTMLElement;
  background?: THREE.ColorRepresentation;
  autoRotate?: boolean;
  showGrid?: boolean;
}

export interface ModelInfo {
  name: string;
  kind: ModelKind;
  boneCount: number;
  cubeCount: number;
  animations: string[];
  textures: string[];
  activeTexture: number;
  format?: string;
  metadata?: Record<string, any>;
}

export interface SkinOptions {
  model?: "auto" | "classic" | "slim";
  name?: string;
}

export interface BedrockLoadOptions {
  name?: string;
  animations?: AnimationDef[];
  modelYaw?: number;
  previewAnimation?: string;
  metadata?: Record<string, any>;
  /** Mirror X like GeckoLib/Blockbench. Defaults to true for Bedrock/YSM models. */
  mirror?: boolean;
}

export class MinecraftModelViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly root: THREE.Group;

  private readonly resizeObserver?: ResizeObserver;
  private readonly canvas: HTMLCanvasElement;
  private lastFrameTime = performance.now();

  private modelRoot: THREE.Group | null = null;
  private builtModel: BuiltModel | null = null;
  private skinModel: SkinModel | null = null;
  private player: AnimationPlayer | null = null;
  private animationDefs = new Map<string, AnimationDef>();
  private materialSet: THREE.Material[] = [];
  private textureCache: THREE.Texture[] = [];
  private textureImages: LoadedImage[] = [];
  private textureNames: string[] = [];
  private currentInfo: ModelInfo | null = null;
  private modelKind: ModelKind = "bedrock";
  private defaultAzimuth = 0;
  private modelYawOffset = 0;

  private grid: THREE.GridHelper;
  private ground: THREE.Mesh;

  constructor(options: ViewerOptions = {}) {
    this.canvas =
      options.canvas ??
      (() => {
        const canvas = document.createElement("canvas");
        canvas.style.display = "block";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        (options.container ?? document.body).appendChild(canvas);
        return canvas;
      })();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(options.background ?? 0x0f1116);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.camera.position.set(0, 1.35, 4.2);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 30;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.autoRotate = options.autoRotate ?? true;
    this.controls.target.set(0, 1, 0);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.setupLights();
    this.ground = this.createGround();
    this.grid = this.createGrid();
    this.scene.add(this.ground, this.grid);
    this.grid.visible = options.showGrid ?? true;

    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      const parent = this.canvas.parentElement;
      if (parent) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(parent);
      }
    }
    window.addEventListener("resize", this.resize);

    this.renderer.setAnimationLoop(() => this.tick());
  }

  private setupLights(): void {
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x5a6070, 1.35);
    this.scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0xffffff, 0.62);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(3.5, 6, 4.5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8fb8ff, 0.4);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);
  }

  private createGround(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(40, 40);
    const material = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    mesh.visible = false;
    return mesh;
  }

  private contactShadow: THREE.Mesh | null = null;

  private updateContactShadow(center: THREE.Vector3, size: THREE.Vector3): void {
    if (!this.contactShadow) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d")!;
      const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64);
      gradient.addColorStop(0, "rgba(0,0,0,0.34)");
      gradient.addColorStop(0.55, "rgba(0,0,0,0.16)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      const texture = canvasToTexture(canvas);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      });
      this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      this.contactShadow.rotation.x = -Math.PI / 2;
      this.contactShadow.position.y = 0.004;
      this.contactShadow.renderOrder = -1;
      this.scene.add(this.contactShadow);
    }
    const footprint = Math.max(size.x, size.z, 0.4);
    this.contactShadow.position.x = center.x;
    this.contactShadow.position.z = center.z;
    this.contactShadow.scale.set(footprint * 1.5, footprint * 1.5, 1);
  }

  private createGrid(): THREE.GridHelper {
    const grid = new THREE.GridHelper(12, 24, 0x394155, 0x232837);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    return grid;
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth || window.innerWidth);
    const height = Math.max(1, parent?.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private tick(): void {
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.controls.update();
    if (this.player) {
      this.player.update(delta);
      this.player.apply();
    }
    this.renderer.render(this.scene, this.camera);
  }

  get info(): ModelInfo | null {
    return this.currentInfo;
  }

  get animations(): string[] {
    return [...this.animationDefs.keys()];
  }

  get animationPlayer(): AnimationPlayer | null {
    return this.player;
  }

  get model(): THREE.Group | null {
    return this.modelRoot;
  }

  clearModel(): void {
    if (this.modelRoot) {
      this.root.remove(this.modelRoot);
      this.disposeObject(this.modelRoot);
    }
    for (const texture of this.textureCache) texture.dispose();
    this.textureCache = [];
    this.textureImages = [];
    this.textureNames = [];
    this.materialSet = [];
    this.modelRoot = null;
    this.builtModel = null;
    this.skinModel = null;
    this.player = null;
    this.animationDefs = new Map();
    this.currentInfo = null;
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
    for (const material of this.materialSet) {
      (material as any).map?.dispose?.();
      material.dispose();
    }
  }

  setAutoRotate(value: boolean): void {
    this.controls.autoRotate = value;
  }

  setGridVisible(value: boolean): void {
    this.grid.visible = value;
    this.ground.visible = value;
  }

  /**
   * Rotates the model around its vertical axis, in degrees.
   * Humanoid Bedrock/YSM models face +Z by default; many mob models are
   * authored facing -Z, so 180 makes them face the camera.
   */
  setModelYaw(degrees: number): void {
    this.modelYawOffset = THREE.MathUtils.degToRad(degrees);
    if (this.modelRoot) {
      this.modelRoot.rotation.y = this.modelYawOffset;
      this.frameModel(this.defaultAzimuth);
    }
  }

  get modelYaw(): number {
    return THREE.MathUtils.radToDeg(this.modelYawOffset);
  }

  async loadSkinImage(image: LoadedImage, options: SkinOptions = {}): Promise<ModelInfo> {
    this.clearModel();
    this.modelKind = "skin";

    let canvas = image.canvas;
    let width = image.width;
    let height = image.height;

    const legacy = expandLegacySkin(canvas, width, height);
    if (legacy) {
      canvas = legacy;
      width = 64;
      height = 64;
    }

    let slim = false;
    if (options.model === "slim") slim = true;
    else if (options.model === "classic") slim = false;
    else slim = detectSlimSkin(canvas, width, height);

    const texture = canvasToTexture(canvas);
    this.textureCache.push(texture);
    this.textureImages = [image];
    this.textureNames = ["skin"];

    const skin = buildSkinModel(texture, {
      slim,
      textureWidth: width,
      textureHeight: height,
    });
    this.skinModel = skin;
    this.materialSet = skin.materials;
    this.modelRoot = skin.root;
    this.root.add(skin.root);
    this.defaultAzimuth = 0;
    this.resetView();

    this.animationDefs = new Map();
    this.player = null;

    this.currentInfo = {
      name: options.name || (slim ? "Alex 皮肤" : "Steve 皮肤"),
      kind: "skin",
      boneCount: 6,
      cubeCount: 6,
      animations: [],
      textures: this.textureNames,
      activeTexture: 0,
      format: slim ? "slim (3px arms)" : "classic (4px arms)",
    };
    return this.currentInfo;
  }

  loadBedrockModel(
    geometryJson: any,
    images: LoadedImage[],
    animationDocs: any[],
    options: BedrockLoadOptions = {},
  ): ModelInfo {
    this.clearModel();
    this.modelKind = "bedrock";

    const doc = parseBedrockGeometry(geometryJson);
    this.textureImages = images;
    this.textureNames = images.map((_, index) => `texture${index + 1}`);

    const texture =
      images.length > 0 ? textureFromLoadedImage(images[0]) : createMissingTexture();
    this.textureCache.push(texture);

    const built = buildBedrockModel(doc, texture, { mirror: options.mirror ?? true });
    this.builtModel = built;
    this.materialSet = built.materials;

    built.root.rotation.y = options.modelYaw ?? this.modelYawOffset;
    this.modelRoot = built.root;
    this.root.add(built.root);

    this.animationDefs = new Map();
    for (const animationJson of animationDocs) {
      for (const [name, def] of parseAnimations(animationJson)) {
        if (!this.animationDefs.has(name)) this.animationDefs.set(name, def);
      }
    }
    for (const def of options.animations ?? []) {
      if (!this.animationDefs.has(def.name)) this.animationDefs.set(def.name, def);
    }

    this.player = new AnimationPlayer(built.bones, this.animationDefs);
    this.defaultAzimuth = 0;
    this.resetView();

    const preferred =
      options.previewAnimation ||
      (this.animationDefs.has("idle")
        ? "idle"
        : this.animationDefs.has("animation.model.idle")
          ? "animation.model.idle"
          : this.animationDefs.keys().next().value);
    if (preferred) {
      try {
        this.player.play(preferred);
      } catch {
        /* no animation */
      }
    }

    this.currentInfo = {
      name: options.name || doc.identifier,
      kind: this.modelKind,
      boneCount: doc.bones.length,
      cubeCount: built.cubeCount,
      animations: [...this.animationDefs.keys()],
      textures: this.textureNames,
      activeTexture: 0,
      format: `${doc.formatVersion} · ${doc.textureWidth}x${doc.textureHeight}`,
      metadata: options.metadata,
    };
    return this.currentInfo;
  }

  async loadPackageBytes(bytes: Uint8Array, name = "模型包"): Promise<ModelInfo> {
    return this.applyPackage(await loadModelPackage(bytes, name));
  }

  private applyPackage(pack: PackageData): ModelInfo {
    this.clearModel();
    const info = this.loadBedrockModel(
      pack.geometryJson,
      pack.textures,
      pack.animations,
      {
        name: pack.name,
        previewAnimation: pack.previewAnimation,
        metadata: pack.metadata,
        mirror: true,
      },
    );
    info.kind = "ysm";
    info.textures = pack.textureNames;
    info.activeTexture = pack.defaultTextureIndex;
    this.modelKind = "ysm";
    this.currentInfo = info;

    // YSM properties.height_scale / width_scale: stretch around the feet.
    if (pack.heightScale !== 1 || pack.widthScale !== 1) {
      const root = this.modelRoot;
      if (root) {
        root.scale.multiply(new THREE.Vector3(pack.widthScale, pack.heightScale, pack.widthScale));
        root.position.y *= pack.heightScale;
        this.resetView();
      }
    }

    if (pack.defaultTextureIndex > 0 && pack.textures[pack.defaultTextureIndex]) {
      this.setTextureIndex(pack.defaultTextureIndex);
    }
    if (pack.previewAnimation) {
      try {
        this.player?.play(pack.previewAnimation);
      } catch {
        /* keep default */
      }
    }
    return info;
  }

  setTextureIndex(index: number): void {
    if (index < 0 || index >= this.textureImages.length) return;
    const image = this.textureImages[index];
    const texture = canvasToTexture(image.canvas);
    this.textureCache.push(texture);

    for (const material of this.materialSet) {
      if ("map" in material) {
        (material as THREE.MeshLambertMaterial).map = texture;
        material.needsUpdate = true;
      }
    }
    if (this.currentInfo) {
      this.currentInfo.activeTexture = index;
      this.currentInfo.textures = this.textureNames;
    }
  }

  playAnimation(name: string | null): void {
    if (!this.player) return;
    this.player.play(name);
    this.player.apply();
  }

  toggleAnimation(): void {
    this.player?.toggle();
  }

  setAnimationSpeed(speed: number): void {
    this.player?.setSpeed(speed);
  }

  seekAnimation(seconds: number): void {
    if (!this.player) return;
    this.player.seek(seconds);
    this.player.apply();
  }

  pauseAnimation(): void {
    this.player?.pause();
  }

  resumeAnimation(): void {
    this.player?.resume();
  }

  resetView(): void {
    this.frameModel(this.defaultAzimuth);
  }

  frontView(): void {
    this.frameModel(0);
  }

  backView(): void {
    this.frameModel(Math.PI);
  }

  frameModel(azimuth = 0): void {
    if (!this.modelRoot) return;
    this.modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.tan(fov / 2)) * 1.35 + 0.35;

    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + Math.sin(azimuth) * distance,
      center.y + radius * 0.04,
      center.z + Math.cos(azimuth) * distance,
    );
    this.updateContactShadow(center, size);
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = distance * 6;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = Math.max(0.3, distance * 0.3);
    this.controls.maxDistance = distance * 5;
    this.controls.update();
  }

  async loadFiles(files: File[]): Promise<ModelInfo> {
    const list = [...files];
    if (list.length === 0) throw new Error("没有选择文件");

    const archive = list.find((file) => /\.(zip|ysm)$/i.test(file.name));
    if (archive) {
      const bytes = new Uint8Array(await archive.arrayBuffer());
      return this.loadPackageBytes(bytes, archive.name.replace(/\.[^.]+$/, ""));
    }

    // Folder-style YSM package: ysm.json + relative model/animation/texture files.
    const folderManifest = list.find((file) => file.name.toLowerCase() === "ysm.json");
    if (folderManifest) {
      const pack = await loadModelPackageFromFiles(list, "模型包");
      return this.applyPackage(pack);
    }

    const images: LoadedImage[] = [];
    const imageFiles: string[] = [];
    let geometryJson: any = null;
    let geometryName = "";
    const animationDocs: any[] = [];
    let javaModelDetected = false;

    for (const file of list) {
      if (/\.png$/i.test(file.name)) {
        try {
          images.push(await imageBytesToCanvas(new Uint8Array(await file.arrayBuffer())));
          imageFiles.push(file.name);
        } catch {
          /* ignore broken image */
        }
        continue;
      }

      if (/\.json$/i.test(file.name)) {
        try {
          const json = JSON.parse(await file.text());
          if (isBedrockGeometry(json)) {
            if (!geometryJson) {
              geometryJson = json;
              geometryName = file.name.replace(/\.json$/i, "");
            }
          } else if (json && typeof json === "object" && json.animations) {
            animationDocs.push(json);
          } else if (json && typeof json === "object" && json.elements && json.textures) {
            javaModelDetected = true;
          }
        } catch {
          /* ignore invalid json */
        }
      }
    }

    if (geometryJson) {
      const info = this.loadBedrockModel(geometryJson, images, animationDocs, {
        name: geometryName,
      });
      if (images.length > 0) info.textures = imageFiles;
      return info;
    }

    if (javaModelDetected) throw new JavaModelJsonError();

    if (images.length > 0) {
      return this.loadSkinImage(images[0], { model: "auto", name: imageFiles[0] });
    }

    throw new Error("没有从文件中识别出基岩模型、皮肤或模型包");
  }

  async loadUrl(url: string, filename?: string): Promise<ModelInfo> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`加载失败：${response.status} ${url}`);
    const blob = await response.blob();
    const name = filename || url.split("/").pop() || "model";
    const file = new File([blob], name, { type: blob.type });
    return this.loadFiles([file]);
  }

  dispose(): void {
    this.clearModel();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.renderer.dispose();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resize);
  }
}

export { YsmEncryptedError, JavaModelJsonError, isEncryptedYsm, isZip };
