# NOTICE / 版权与来源说明

`mc-model-kit` 是一个独立的 Three.js 模型查看器插件。本文件列出随包分发或参考实现的第三方作品与模型资产。任何再分发都必须完整保留本文件、`协议.md`、`LICENSE`、`THIRD_PARTY_LICENSES.md` 和 `licenses/` 目录。

## 1. 插件代码

- `mc-model-kit` 原创代码：MIT License，Copyright (c) 2026 mc-model-kit contributors。
- Three.js：MIT License，Copyright © 2010-2025 three.js authors。
- fflate：MIT License，Copyright (c) 2026 Arjun Barrett。

## 2. 参考/对照的开源项目（未直接复制其源代码）

- **GeckoLib** — MIT License，Copyright (c) 2026 GeckoLib。
  仓库：https://github.com/bernie-g/geckolib
  用途：核对 GeoBone / GeoCube 的 pivot、旋转与渲染语义。

- **Yes Steve Model** — Apache License 2.0，Copyright Yes Steve Model Dev Group。
  仓库：https://github.com/YesSteveModel/YesSteveModel
  用途：核对 YSM 的 `GeoBuilder` 坐标转换、模型包结构、动画和贴图规则。

- **Yes Steve Model Native** — Apache License 2.0，Copyright Yes Steve Model Dev Group。
  仓库：https://github.com/YesSteveModel/YesSteveModel-Native
  用途：核对 Native 的烘焙、骨骼变换与渲染顺序。

- **Legacy YSM（LgeacyYSM）** — BSD 3-Clause License，Copyright (c) 2025, Yes Steve Model Dev Group。
  仓库：https://github.com/YesSteveModel/LgeacyYSM
  用途：历史版本兼容参考；其默认模型为 CC0。

- **Blockbench** — MIT License，Copyright JannisX11 与 Blockbench contributors。
  仓库：https://github.com/JannisX11/blockbench
  用途：核对 Bedrock 几何的 X 镜像、UV 与 cube 旋转语义。

上述项目仅用于语义对照与测试，除非文件头另有说明，本插件不包含其源代码。

## 3. 随包示例模型（CC0）

以下模型来自 Yes Steve Model 的 `src/main/resources/assets/ysm/builtin/`，其 `ysm.json` 中 `metadata.license.type` 均为 `CC 0`：

### Default

- 路径：`builtin/default/`
- 作者：哥斯拉（模型）、端木一动不动（动画）、甜粽子（动画）、星屑海螺（动画）、蓝玫瑰（材质/模型）、艾雷克亚（铁魔法动画）
- 许可证：CC0 1.0 Universal
- 随包文件：`test-assets/cc0/default.zip`

### Default Boy

- 路径：`builtin/misc/3_default_boy/`
- 作者：哥斯拉（模型）、端木一动不动（动画）
- 许可证：CC0 1.0 Universal
- 随包文件：`test-assets/cc0/default-boy.zip`

### Steve

- 路径：`builtin/misc/2_steve/`
- 作者：哥斯拉（模型）、端木一动不动（动画）、甜粽子（动画）
- 许可证：CC0 1.0 Universal
- 随包文件：`test-assets/cc0/steve.zip`

CC0 不强制署名，但本包仍保留作者与来源信息，作为对原作者的尊重。

## 4. Wine Fox / 酒狐（不随本包分发）

- 模型：`builtin/wine_fox/01_taisho_maid/`（大正女仆）
- 许可证：**CC BY-NC-SA 4.0**
- 作者：完美冻结（模型原作）、星屑海螺（动画原作）、哥斯拉（映素团队，模型修改）、白帆小喵（新版材质）、蓝玫瑰（UI 材质/贴图）、墨染逝羽（面具模型）、Maks怜悯（载具模型）、浅陌菌（模型修改）、祸御神（动画修改）、羊毛（音效/动画修改）
- 来源：https://github.com/YesSteveModel/YesSteveModel/tree/dev/1.20/src/main/resources/assets/ysm/builtin/wine_fox/01_taisho_maid
- 说明：该模型仅用于本地测试，**不包含在本发布包中**。如单独分发或修改，必须遵守 CC BY-NC-SA 4.0：署名、非商业、相同方式共享，并完整保留许可证。

完整许可证文本见 `licenses/CC-BY-NC-SA-4.0.txt` 与 `协议.md` 附录 A。

## 5. 保留要求

任何复制、修改、再分发、打包、上传或部署，必须：

1. 完整保留 `协议.md`、`LICENSE`、`NOTICE.md`、`THIRD_PARTY_LICENSES.md`、`LICENSES.sha256` 和 `licenses/` 目录；
2. 不得删除、隐藏、改名、替换或截断其中的版权声明与许可证文本；
3. 在衍生作品的显著位置注明来源与修改；
4. 如使用 Wine Fox / 酒狐模型，额外遵守 CC BY-NC-SA 4.0。
