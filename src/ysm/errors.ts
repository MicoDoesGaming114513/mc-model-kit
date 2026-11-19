export class YsmEncryptedError extends Error {
  readonly modelName?: string;
  readonly metadataText?: string;

  constructor(modelName?: string, metadataText?: string) {
    super(
      "这是一个加密的 .ysm 模型（Yes Steve Model 专属格式）。官方从 1.2.0 起把加密与渲染迁到 C++ 原生层，明确说明 .ysm 无法还原成普通模型文件；浏览器端无法解密。" +
        "请让模型作者导出文件夹格式或 .zip 压缩包（YSM 同样支持这两种未加密格式），再拖入查看器。" +
        (modelName ? ` 模型名：${modelName}` : ""),
    );
    this.name = "YsmEncryptedError";
    this.modelName = modelName;
    this.metadataText = metadataText;
  }
}

export class JavaModelJsonError extends Error {
  constructor() {
    super(
      "检测到 Java 版方块/物品模型（elements / textures 结构）。当前插件面向 GeckoLib / 基岩版实体模型；Java 方块模型的材质变量解析尚未实现。",
    );
    this.name = "JavaModelJsonError";
  }
}
