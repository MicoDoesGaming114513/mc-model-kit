# mc-model-kit

一个基于 **Three.js** 的 Minecraft / GeckoLib 模型查看器插件。用于在浏览器里正确渲染：

- **基岩版模型**（`.geo.json`，format 1.8.0 / 1.12.0 / 1.16.0）
- **GeckoLib 动画**（Bedrock animation 1.8 格式，含 Molang 表达式）
- **YSM（Yes Steve Model）模型包**（文件夹结构或 `.zip` 包）
- **仅需皮肤纹理的玩家模型**（Steve 粗手臂 / Alex 细手臂，64×64 与 64×32 旧版皮肤）

> 重要：官方 `.ysm` 是加密格式，浏览器端无法解密。本插件支持 YSM 的 **zip / 文件夹** 两种未加密形式；遇到加密 `.ysm` 会抛出一个带说明的 `YsmEncryptedError`，不会做破解。

- GitHub 仓库：<https://github.com/MicoDoesGaming114513/mc-model-kit>
- 在线 Demo：<https://micodoesgaming114513.github.io/mc-model-kit/>

---

## 1. 安装与构建

```bash
npm install
npm run dev        # 本地 demo，默认 http://localhost:5173
npm run typecheck  # 只做类型检查
npm run build      # 生成 dist/（ESM + UMD + d.ts）
```

`dist/` 产物：

| 文件 | 用途 |
| --- | --- |
| `dist/mc-model-kit.js` | ESM，`import` 使用 |
| `dist/mc-model-kit.umd.cjs` | UMD，three 外置；适合打包器 / `require` |
| `dist/mc-model-kit.standalone.umd.cjs` | 独立 UMD，three + fflate 已打包，`<script>` 单文件直接用 |
| `dist/index.d.ts` | TypeScript 类型声明 |
| `dist/*.map` | source map |

ESM 版把 `three` 作为 peer dependency；`dist/mc-model-kit.standalone.umd.cjs` 为了方便 `<script>` 使用，内置了 three。`fflate` 已打包进产物（用于 zip 解压）。

---

## 2. 快速开始（ESM）

```ts
import * as THREE from "three";
import { createViewer, imageUrlToCanvas } from "mc-model-kit";

const viewer = createViewer({
  container: document.querySelector("#viewport")!,
  background: 0x0f1116,
  autoRotate: true,
  showGrid: true,
});

// 纯皮肤：自动判断 Steve / Alex，自动升级 64×32 旧皮肤
const skin = await imageUrlToCanvas("/skins/steve.png");
await viewer.loadSkinImage(skin, { model: "auto", name: "Steve" });
```

### 加载基岩模型 + 动画 + 贴图

```ts
import { imageUrlToCanvas } from "mc-model-kit";

const [geometry, animation, texture] = await Promise.all([
  fetch("/models/robot.geo.json").then((r) => r.json()),
  fetch("/models/robot.animation.json").then((r) => r.json()),
  imageUrlToCanvas("/models/robot.png"),
]);

viewer.loadBedrockModel(geometry, [texture], [animation], {
  name: "Robot",
  previewAnimation: "animation.robot.idle", // 不填则优先 idle
});
```

### 加载 YSM zip

```ts
const file = input.files![0];
const bytes = new Uint8Array(await file.arrayBuffer());
await viewer.loadPackageBytes(bytes, file.name);
```

### 一次拖入多个文件（推荐给 demo / 上传框）

```ts
await viewer.loadFiles(files);
```

`loadFiles` 会自动分流：zip/ysm → 模型包；文件夹（含 `ysm.json`）→ YSM 文件夹包；`.png` → 皮肤；含 `minecraft:geometry` / `geometry.*` / 裸 `bones` 的 JSON → 基岩模型；含 `animations` 的 JSON → 动画；Java 方块模型（`elements` + `textures`）会抛 `JavaModelJsonError`。

YSM 文件夹不需要压缩，直接选择整个目录（`<input webkitdirectory>`）或多选目录里的文件即可；`loadFiles` 会读 `ysm.json`、按相对路径/basename 找模型、动画与贴图。也可以直接调用底层：

```ts
const pack = await loadModelPackageFromFiles(files, "My Model");
viewer.loadBedrockModel(pack.geometryJson, pack.textures, pack.animations, {
  name: pack.name,
  previewAnimation: pack.previewAnimation,
  metadata: pack.metadata,
});
```

### URL 快捷加载

```ts
await viewer.loadUrl("/pack.zip");
await viewer.loadUrl("/skin.png");
```

> `loadUrl` 只接受单个 URL；基岩模型需要「几何 + 贴图 + 动画」多个文件时，用 `loadBedrockModel` 或 `loadFiles`。

### UMD

```html
<!-- three 已打包，不需要额外引入 -->
<script src="./dist/mc-model-kit.standalone.umd.cjs"></script>
<script>
  const viewer = MCModelKit.createViewer({ container: document.body });
  MCModelKit.imageUrlToCanvas("/skin.png").then((skin) => viewer.loadSkinImage(skin));
</script>
```

`dist/mc-model-kit.umd.cjs` 是 three 外置的版本；如果页面已有全局 `THREE`（例如通过打包器注入），可以用它并自行提供 three。

---

## 3. API 概览

### `createViewer(options?) → MinecraftModelViewer`

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `container` | `HTMLElement` | — | 挂载容器；不传则挂到 `body` |
| `canvas` | `HTMLCanvasElement` | 自动创建 | 使用已有 canvas |
| `background` | `ColorRepresentation` | `0x0f1116` | 场景背景 |
| `autoRotate` | `boolean` | `true` | 自动旋转 |
| `showGrid` | `boolean` | `true` | 地面网格 |

### 加载

```ts
loadSkinImage(image: LoadedImage, options?: SkinOptions): Promise<ModelInfo>
loadBedrockModel(geometryJson, images: LoadedImage[], animationDocs: any[], options?): ModelInfo
loadPackageBytes(bytes: Uint8Array, name?: string): Promise<ModelInfo>
loadFiles(files: File[]): Promise<ModelInfo>
loadUrl(url: string, filename?: string): Promise<ModelInfo>
```

`SkinOptions`：

```ts
{ model?: "auto" | "classic" | "slim"; name?: string }
```

`BedrockLoadOptions`：

```ts
{
  name?: string;
  animations?: AnimationDef[];   // 直接传已解析的动画
  modelYaw?: number;             // 模型绕 Y 轴旋转（弧度）
  previewAnimation?: string;
  metadata?: Record<string, any>;
}
```

### 动画

```ts
viewer.playAnimation("animation.robot.wave");
viewer.playAnimation(null);        // 停止并回到 rest pose
viewer.toggleAnimation();
viewer.setAnimationSpeed(1.5);
viewer.seekAnimation(0.4);         // 跳到指定秒
viewer.pauseAnimation();
viewer.resumeAnimation();
viewer.animations;                 // string[]
viewer.animationPlayer;            // AnimationPlayer | null
```

### 视图 / 模型

```ts
viewer.setAutoRotate(true);
viewer.setGridVisible(false);
viewer.setModelYaw(180);           // 很多生物模型朝 -Z，翻转 180° 面对相机
viewer.frontView();
viewer.backView();
viewer.resetView();
viewer.frameModel(Math.PI / 4);    // 指定方位角重新取景
viewer.setTextureIndex(0);         // YSM 多贴图切换
viewer.info;                       // ModelInfo | null
viewer.model;                      // THREE.Group | null
viewer.clearModel();
viewer.dispose();
```

### 底层工具（可单独使用）

```ts
import {
  parseBedrockGeometry,
  buildBedrockModel,
  parseAnimations,
  AnimationPlayer,
  buildSkinModel,
  detectSlimSkin,
  expandLegacySkin,
  loadModelPackage,
  loadModelPackageFromFiles,
  isEncryptedYsm,
  imageBytesToCanvas,
  imageUrlToCanvas,
  canvasToTexture,
} from "mc-model-kit";
```

---

## 4. 支持矩阵

### 基岩版几何

| 能力 | 状态 |
| --- | --- |
| format 1.8.0（`"geometry.<id>"` 对象） | ✅ |
| format 1.12.0 / 1.16.0（`minecraft:geometry` 数组） | ✅ |
| 裸 `bones` 几何 | ✅ |
| `texture_width` / `texture_height`（1.8 的 `texturewidth`） | ✅ |
| 骨骼 `parent` / `pivot` / `rotation` | ✅ |
| cube `origin` / `size` / `uv`（盒式） | ✅ |
| per-face `uv` / `uv_size` / 省略某些面 | ✅ |
| `inflate` / `mirror` / cube `rotation` + `pivot` | ✅ |
| 负 size（自动取反并修正绕序） | ✅ |
| 盒式 UV 列顺序 | `east / north / west / south`（Blockbench 实测） |
| Java 方块/物品 `.json`（`elements` + `textures`） | ❌ 抛 `JavaModelJsonError` |
| 渲染控制器 / 材质变体 / 粒子 / 音效 | ❌ |

### 动画

| 能力 | 状态 |
| --- | --- |
| Bedrock 1.8 animation | ✅ |
| `loop`: `true` / `false` / `"hold_on_last_frame"` | ✅ |
| `animation_length` / 自动推导长度 | ✅ |
| `start_delay` | ✅ |
| bone `rotation` / `position` / `scale` | ✅ |
| 关键帧：数组 / `{x,y,z}` / 标量 / Molang 字符串 | ✅ |
| `lerp_mode`: `linear` / `catmullrom` / `step` | ✅ |
| `query.anim_time` / `query.life_time` | ✅ |
| Molang 子集（见下） | ✅ |
| animation controller 状态机 / `particle_effects` / `sound_effects` | ❌ |

Molang 子集：`query.` / `q.`、`variable.` / `v.`、`temp.` / `t.`；`math.sin/cos/tan/asin/acos/atan/atan2/abs/ceil/floor/round/trunc/sqrt/pow/exp/log/log10/min/max/mod/lerp/clamp/random`；`math.pi` / `math.e`；四则、取余、比较、`&&` / `||` / `!`、三元、括号、函数调用。未知标识符回退 `0`。

### YSM

| 能力 | 状态 |
| --- | --- |
| `.zip` 包（`ysm.json` + models / animations / textures） | ✅ |
| 文件夹结构（选择目录 / 含 `ysm.json` 的多文件） | ✅（相对路径 + basename 兜底） |
| `metadata` / `properties` / `default_texture` / `preview_animation` | ✅ |
| `height_scale` / `width_scale` | ✅ |
| `files.player.model.main` | ✅ |
| `files.player.model.arm` / `fp_arm` | ❌（第一人称手臂模型忽略） |
| `files.player.animation.main / extra / tac / carryon...` | ✅ |
| 多贴图（字符串或 `{uv, normal, specular}`） | ✅（只使用 `uv`） |
| 法线 / 高光贴图 | ❌ |
| 官方加密 `.ysm` | ❌ 无法解密，抛 `YsmEncryptedError` |
| 旧版恰好是 zip 的 `.ysm` | ✅ 走 zip 分支 |

YSM zip 最小结构：

```
model.zip
├─ ysm.json
├─ models/
│  ├─ main.json
│  └─ arm.json
├─ animations/
│  └─ main.animation.json
└─ textures/
   └─ texture.png
```

`ysm.json` 关键字段示例：

```json
{
  "spec": 2,
  "metadata": { "name": "My Model", "tips": "...", "authors": [{ "name": "..." }] },
  "properties": {
    "preview_animation": "idle",
    "default_texture": "texture",
    "height_scale": 1,
    "width_scale": 1
  },
  "files": {
    "player": {
      "model": { "main": "models/main.json", "arm": "models/arm.json" },
      "animation": {
        "main": "animations/main.animation.json",
        "extra": "animations/extra.animation.json"
      },
      "texture": ["textures/texture.png"]
    }
  }
}
```

### 皮肤

| 能力 | 状态 |
| --- | --- |
| 64×64 Steve / Alex | ✅ |
| 64×32 旧版皮肤自动镜像扩展为 64×64 | ✅ |
| Alex 细手臂自动检测（右臂 54..56 / 左臂 46..48 透明列） | ✅ |
| 可手动强制 `classic` / `slim` | ✅ |
| 内层 + 外层（帽子 / 衣服第二层） | ✅ |
| HD 皮肤（128×128 等，按 `width/64` 缩放） | ✅ |
| 披风 / 鞘翅 / 第一人称手臂 | ❌ |

检测细手臂的规则：若右臂 `x=54..56, y=20..32` 与左臂 `x=46..48, y=52..64` 的像素全部透明，则判定为 Alex（3px 手臂）；否则 Steve（4px）。

---

## 5. 朝向与坐标系

- 模型内部以 **1 像素 = 1/16 方块** 为单位；根节点缩放 `1/16`，脚底落在 `y=0`。
- **人形基岩/YSM 模型**（使用标准皮肤 UV，脸在 `(8,8)`）正面朝 **+Z**，与 Three.js 相机默认方向一致，因此默认 `modelYaw = 0`。
- **很多生物模型**（例如原版牛）是朝 **-Z** 制作的。遇到这类模型，调用：

```ts
viewer.setModelYaw(180);
// 或在加载时传：
viewer.loadBedrockModel(geo, [tex], [anim], { modelYaw: Math.PI });
```

- `frontView()` / `backView()` 只移动相机，不改变模型自身朝向。

---

## 6. `.ysm` 加密格式说明

官方文档明确：从 **1.2.0** 起，YSM 把加密与渲染迁到 C++ 原生层，`.ysm` **不能还原成普通模型文件，也不能二次修改**，只做向下兼容。文件头是 `YSGP`，正文是加密的模型数据。

因此本插件的处理方式是：

1. 读取前 4 字节，若为 `YSGP`，尝试从明文头部提取 `<name>`；
2. 抛 `YsmEncryptedError`，消息中包含模型名与解决办法；
3. demo 会显示一个错误浮层，提示作者导出 **文件夹** 或 **zip**。

```ts
import { YsmEncryptedError } from "mc-model-kit";

try {
  await viewer.loadFiles(files);
} catch (error) {
  if (error instanceof YsmEncryptedError) {
    console.warn(error.modelName, error.message);
  }
}
```

---

## 7. Demo

在线 Demo：<https://micodoesgaming114513.github.io/mc-model-kit/>

本地运行：

```bash
npm run dev
# http://127.0.0.1:5173
```

Demo 支持：

- 拖拽 / 多选：`.geo.json` + `.animation.json` + `.png`、`.zip`、`.ysm`
- 选择 YSM 文件夹：读取 `ysm.json` 及相对路径下的模型/动画/贴图
- 示例：Steve / Alex / 旧版皮肤、基岩模型、YSM zip、加密 `.ysm`
- 模型信息：名称、类型、骨骼数、cube 数、动画、贴图、格式、YSM metadata
- 动画：下拉选择、播放/暂停、速度、进度拖动（`seekAnimation`）
- 皮肤粗/细手臂切换
- 自动旋转、网格、正面/背面/翻转 180°/复位

---

## 8. 目录结构

```
mc-model-kit/
├─ src/
│  ├─ index.ts                     # 公共 API
│  ├─ bedrock/
│  │  ├─ types.ts                  # 几何中间结构
│  │  ├─ parseGeometry.ts          # 1.8 / 1.12 / 1.16 归一化
│  │  └─ buildModel.ts             # 骨骼树、盒式/逐面 UV、法线、绕序
│  ├─ animation/
│  │  ├─ molang.ts                 # Molang 子集
│  │  ├─ parseAnimation.ts         # 动画解析 / 采样
│  │  └─ AnimationPlayer.ts        # 播放、seek、reset
│  ├─ skin/
│  │  ├─ buildSkin.ts              # Steve/Alex 内外层皮肤模型
│  │  └─ detectSlim.ts             # 细手臂检测 / 旧皮肤扩展
│  ├─ ysm/
│  │  ├─ loadPackage.ts            # zip 读取、ysm.json、贴图/动画解析
│  │  └─ errors.ts                 # YsmEncryptedError / JavaModelJsonError
│  ├─ util/image.ts                # 图片解码 / CanvasTexture
│  └─ viewer/MinecraftModelViewer.ts
├─ demo/                           # demo 逻辑与样式
├─ public/test/                    # 测试素材
├─ scripts/                        # 无头浏览器截图 / UV 调试脚本
├─ index.html
├─ package.json
├─ vite.config.ts
└─ tsconfig*.json
```

---

## 9. 已知限制

- 不支持加密 `.ysm`（官方格式，无法在浏览器解密）。
- 不支持 Java 版方块/物品 JSON（`elements` + `textures`）；会明确报错。
- 不支持 animation controller 状态机、渲染控制器、粒子、音效、法线/高光贴图。
- Molang 只实现常用子集，不是完整 Molang 运行时。
- 透明材质使用 `alphaTest`，没有按深度排序的半透明面（Minecraft 风格 cutout 足够）。
- 浏览器端只做单模型查看；没有实体 AI、物理、碰撞。

## License / 许可证与保留要求

- 插件原创代码：**MIT**，见 `LICENSE`。
- 完整使用与分发协议：**`协议.md`**（包含 MIT、Apache-2.0、BSD-3-Clause、CC0-1.0、CC BY-NC-SA 4.0 全文）。
- 第三方组件与模型来源：`NOTICE.md`、`THIRD_PARTY_LICENSES.md`、`licenses/`。

**强制保留要求：** 任何复制、修改、再分发、打包、上传或部署，都必须完整保留 `协议.md`、`LICENSE`、`NOTICE.md`、`THIRD_PARTY_LICENSES.md`、`LICENSES.sha256` 和 `licenses/` 目录，不得删除、隐藏、改名或替换其中的版权声明与许可证文本。`LICENSES.sha256` 用于校验这些文件未被改动。衍生作品必须在显著位置注明来源与修改。

随包示例模型为 **CC0**（Default / Default Boy / Steve），可自由使用；**Wine Fox / 酒狐（01_taisho_maid）不随本包分发**，其许可证为 **CC BY-NC-SA 4.0**，如单独使用必须署名、非商业、相同方式共享，并完整保留许可证。详见 `协议.md` 与 `NOTICE.md`。
