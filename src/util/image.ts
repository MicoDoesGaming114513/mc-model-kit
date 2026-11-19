import * as THREE from "three";

export interface LoadedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export async function imageBytesToCanvas(bytes: Uint8Array): Promise<LoadedImage> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "image/png" });
  let bitmap: ImageBitmap | HTMLImageElement;

  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(blob);
  } else {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片解码失败"));
      image.src = URL.createObjectURL(blob);
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建 Canvas 上下文");
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  return { canvas, width: canvas.width, height: canvas.height };
}

export async function imageUrlToCanvas(url: string): Promise<LoadedImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`加载图片失败：${response.status} ${url}`);
  return imageBytesToCanvas(new Uint8Array(await response.arrayBuffer()));
}

export function canvasToTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function textureFromLoadedImage(image: LoadedImage): THREE.Texture {
  return canvasToTexture(image.canvas);
}

export function createMissingTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? "#111111" : "#ff00ff";
      context.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  context.fillStyle = "rgba(0,0,0,0.55)";
  context.fillRect(0, 28, 64, 10);
  context.fillStyle = "#ffffff";
  context.font = "8px monospace";
  context.textAlign = "center";
  context.fillText("NO TEXTURE", 32, 36);
  return canvasToTexture(canvas);
}
