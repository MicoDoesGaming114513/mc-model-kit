import "./style.css";
import {
  imageBytesToCanvas,
  MinecraftModelViewer,
  YsmEncryptedError,
  type ModelInfo,
} from "../src";

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const viewer = new MinecraftModelViewer({
  canvas,
  autoRotate: true,
  showGrid: true,
});

declare global {
  interface Window {
    viewer: MinecraftModelViewer;
    __ready: boolean;
  }
}
window.viewer = viewer;

const statusBadge = document.querySelector<HTMLDivElement>("#statusBadge")!;
const dropZone = document.querySelector<HTMLDivElement>("#dropZone")!;
const fileInput = document.querySelector<HTMLInputElement>("#fileInput")!;
const folderInput = document.querySelector<HTMLInputElement>("#folderInput")!;
const folderBtn = document.querySelector<HTMLButtonElement>("#folderBtn")!;
const browseBtn = document.querySelector<HTMLButtonElement>("#browseBtn")!;
const infoGroup = document.querySelector<HTMLElement>("#infoGroup")!;
const infoName = document.querySelector<HTMLElement>("#infoName")!;
const infoKind = document.querySelector<HTMLElement>("#infoKind")!;
const infoBones = document.querySelector<HTMLElement>("#infoBones")!;
const infoAnims = document.querySelector<HTMLElement>("#infoAnims")!;
const infoTex = document.querySelector<HTMLElement>("#infoTex")!;
const animGroup = document.querySelector<HTMLElement>("#animGroup")!;
const animSelect = document.querySelector<HTMLSelectElement>("#animSelect")!;
const playBtn = document.querySelector<HTMLButtonElement>("#playBtn")!;
const speedRange = document.querySelector<HTMLInputElement>("#speedRange")!;
const speedOut = document.querySelector<HTMLOutputElement>("#speedOut")!;
const timeRange = document.querySelector<HTMLInputElement>("#timeRange")!;
const timeOut = document.querySelector<HTMLOutputElement>("#timeOut")!;
let scrubbing = false;
const skinGroup = document.querySelector<HTMLElement>("#skinGroup")!;
const errorBox = document.querySelector<HTMLElement>("#errorBox")!;
const hint = document.querySelector<HTMLElement>("#hint")!;

let currentSkin: { canvas: HTMLCanvasElement; width: number; height: number; name: string } | null =
  null;

function setStatus(text: string, busy = false): void {
  statusBadge.textContent = text;
  statusBadge.classList.toggle("busy", busy);
}

function showError(error: unknown): void {
  errorBox.hidden = false;
  const title = error instanceof YsmEncryptedError ? "无法加载 .ysm 加密模型" : "加载失败";
  errorBox.innerHTML = `<strong>${title}</strong><p>${String(
    (error as Error)?.message ?? error,
  ).replace(/</g, "&lt;")}</p>`;
  setStatus("失败");
}

function hideError(): void {
  errorBox.hidden = true;
}

function refreshInfo(info: ModelInfo | null): void {
  if (!info) {
    infoGroup.hidden = true;
    animGroup.hidden = true;
    skinGroup.hidden = true;
    return;
  }

  infoGroup.hidden = false;
  infoName.textContent = info.name;
  infoKind.textContent =
    info.kind === "skin" ? "皮肤模型" : info.kind === "ysm" ? "YSM 模型包" : "基岩模型";
  infoBones.textContent = String(info.boneCount);
  infoAnims.textContent = info.animations.length ? `${info.animations.length} 个` : "无";
  infoTex.textContent =
    info.textures.length > 1
      ? `${info.textures.length} 张 · ${info.textures[info.activeTexture]}`
      : info.textures[0] || "—";

  animGroup.hidden = info.animations.length === 0;
  animSelect.innerHTML = "";
  for (const name of info.animations) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.replace(/^animation\./, "");
    animSelect.append(option);
  }
  if (info.animations.length > 0) {
    const active = viewer.animationPlayer?.animationName ?? info.animations[0];
    animSelect.value = active;
    playBtn.textContent = viewer.animationPlayer?.isPlaying ? "❚❚" : "▶";
  }

  skinGroup.hidden = info.kind !== "skin";
  timeRange.value = "0";
  timeOut.textContent = "0.00s";
  syncTimeline();
  setStatus(info.kind === "skin" ? "皮肤已加载" : "模型已加载");
}

function syncTimeline(): void {
  if (scrubbing) return;
  const player = viewer.animationPlayer;
  if (!player) return;
  const length = player.animationLength;
  const time = Math.min(player.animationTime, length);
  timeRange.value = String(length > 0 ? Math.round((time / length) * 1000) : 0);
  timeOut.textContent = `${time.toFixed(2)}s`;
}

setInterval(syncTimeline, 120);

async function handleFiles(files: File[]): Promise<void> {
  hideError();
  setStatus("加载中…", true);
  try {
    if (files.length === 1 && /\.png$/i.test(files[0].name)) {
      const image = await imageBytesToCanvas(new Uint8Array(await files[0].arrayBuffer()));
      currentSkin = { ...image, name: files[0].name.replace(/\.png$/i, "") };
      const info = await viewer.loadSkinImage(image, {
        model: "auto",
        name: currentSkin.name,
      });
      refreshInfo(info);
    } else {
      const info = await viewer.loadFiles(files);
      currentSkin = null;
      refreshInfo(info);
    }
    window.__ready = true;
  } catch (error) {
    console.error(error);
    showError(error);
    refreshInfo(null);
  }
}

browseBtn.addEventListener("click", () => fileInput.click());
folderBtn.addEventListener("click", () => folderInput.click());
folderInput.addEventListener("change", () => {
  if (folderInput.files) void handleFiles([...folderInput.files]);
  folderInput.value = "";
});
fileInput.addEventListener("change", () => {
  if (fileInput.files) void handleFiles([...fileInput.files]);
  fileInput.value = "";
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const files = event.dataTransfer?.files;
  if (files) void handleFiles([...files]);
});

const samples: Record<string, string[]> = {
  "skin-steve": ["test/skin-steve.png"],
  "skin-alex": ["test/skin-alex.png"],
  "skin-legacy": ["test/skin-legacy.png"],
  geo: ["test/robot.geo.json", "test/robot.animation.json", "test/robot.png"],
  "geo-1.8": ["test/robot-1.8.geo.json", "test/robot.animation.json", "test/robot.png"],
  "geo-1.16": ["test/robot-1.16.geo.json", "test/robot.animation.json", "test/robot.png"],
  ysm: ["test/robot-model.zip"],
  "ysm-folder": [
    "test/robot-folder/test_pack/ysm.json",
    "test/robot-folder/test_pack/models/main.json",
    "test/robot-folder/test_pack/animations/main.animation.json",
    "test/robot-folder/test_pack/textures/robot.png",
  ],
  "ysm-encrypted": ["test/encrypted-demo.ysm"],
};

async function loadSample(name: string): Promise<void> {
  const urls = samples[name];
  if (!urls) return;
  hideError();
  setStatus("加载示例…", true);
  try {
    if (urls.length === 1 && urls[0].endsWith(".png")) {
      const response = await fetch(urls[0]);
      const image = await imageBytesToCanvas(new Uint8Array(await response.arrayBuffer()));
      currentSkin = {
        ...image,
        name: urls[0].split("/").pop()!.replace(/\.png$/i, ""),
      };
      const info = await viewer.loadSkinImage(image, {
        model: "auto",
        name: currentSkin.name,
      });
      refreshInfo(info);
    } else if (urls.length === 1 && /\.(zip|ysm)$/.test(urls[0])) {
      const info = await viewer.loadUrl(urls[0]);
      currentSkin = null;
      refreshInfo(info);
    } else {
      const files = await Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url);
          const blob = await response.blob();
          return new File([blob], url.split("/").pop()!, { type: blob.type });
        }),
      );
      const info = await viewer.loadFiles(files);
      refreshInfo(info);
    }
    window.__ready = true;
  } catch (error) {
    console.error(error);
    showError(error);
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => void loadSample(button.dataset.sample!));
});

animSelect.addEventListener("change", () => {
  viewer.playAnimation(animSelect.value);
  playBtn.textContent = "❚❚";
  timeRange.value = "0";
});

timeRange.addEventListener("pointerdown", () => {
  scrubbing = true;
});
window.addEventListener("pointerup", () => {
  scrubbing = false;
});
timeRange.addEventListener("input", () => {
  const player = viewer.animationPlayer;
  if (!player) return;
  const length = player.animationLength;
  const time = (Number(timeRange.value) / 1000) * length;
  viewer.seekAnimation(time);
  timeOut.textContent = `${time.toFixed(2)}s`;
});
playBtn.addEventListener("click", () => {
  viewer.toggleAnimation();
  playBtn.textContent = viewer.animationPlayer?.isPlaying ? "❚❚" : "▶";
});
speedRange.addEventListener("input", () => {
  const speed = Number(speedRange.value);
  viewer.setAnimationSpeed(speed);
  speedOut.textContent = `${speed.toFixed(1)}×`;
});

document.querySelectorAll<HTMLButtonElement>("#skinType button").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!currentSkin) return;
    document
      .querySelectorAll("#skinType button")
      .forEach((item) => item.classList.toggle("active", item === button));
    const type = button.dataset.type as "auto" | "classic" | "slim";
    const info = await viewer.loadSkinImage(currentSkin, {
      model: type,
      name: currentSkin.name,
    });
    refreshInfo(info);
  });
});

const autoRotate = document.querySelector<HTMLInputElement>("#autoRotate")!;
autoRotate.addEventListener("change", () => viewer.setAutoRotate(autoRotate.checked));
const showGrid = document.querySelector<HTMLInputElement>("#showGrid")!;
showGrid.addEventListener("change", () => viewer.setGridVisible(showGrid.checked));

document.querySelector<HTMLButtonElement>("#frontBtn")!.addEventListener("click", () => {
  viewer.frontView();
  hint.textContent = "正面视角";
});
document.querySelector<HTMLButtonElement>("#backBtn")!.addEventListener("click", () => {
  viewer.backView();
  hint.textContent = "背面视角";
});
document.querySelector<HTMLButtonElement>("#resetBtn")!.addEventListener("click", () => {
  viewer.resetView();
  hint.textContent = "视角已复位";
});

let flipped = false;
document.querySelector<HTMLButtonElement>("#flipBtn")!.addEventListener("click", () => {
  flipped = !flipped;
  viewer.setModelYaw(flipped ? 180 : 0);
  hint.textContent = flipped ? "模型翻转 180°" : "模型恢复朝向";
});

const params = new URLSearchParams(location.search);
const initialSample = params.get("sample");
if (initialSample) {
  window.__ready = false;
  void loadSample(initialSample);
} else {
  void loadSample("skin-steve");
}
