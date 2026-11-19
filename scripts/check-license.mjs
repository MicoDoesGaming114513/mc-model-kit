#!/usr/bin/env node
/**
 * 发布前许可证完整性检查。
 * 任何打包都必须保留 协议.md、LICENSE、NOTICE.md、THIRD_PARTY_LICENSES.md 与 licenses/。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = [
  "协议.md",
  "LICENSE",
  "NOTICE.md",
  "THIRD_PARTY_LICENSES.md",
  "LICENSES.sha256",
  "licenses/MIT-Plugin.txt",
  "licenses/MIT-Three.js.txt",
  "licenses/MIT-fflate.txt",
  "licenses/MIT-GeckoLib.txt",
  "licenses/Apache-2.0-YSM.txt",
  "licenses/Apache-2.0-Native.txt",
  "licenses/BSD-3-Clause-LegacyYSM.txt",
  "licenses/CC0-1.0.txt",
  "licenses/CC-BY-NC-SA-4.0.txt",
  "licenses/NOTICE-YesSteveModel.md",
];

const missing = required.filter((file) => {
  const path = resolve(root, file);
  return !existsSync(path) || statSync(path).size === 0;
});

if (missing.length > 0) {
  console.error("[license-check] 缺少必须保留的许可证文件：");
  for (const file of missing) console.error(`  - ${file}`);
  console.error("[license-check] 打包中止。请恢复完整协议文件后再发布。");
  process.exit(1);
}

const forbidden = [
  "test-assets/cc0/taisho-maid.zip",
  "test-assets/taisho-maid.zip",
];
const leaked = forbidden.filter((file) => existsSync(resolve(root, file)));
if (leaked.length > 0) {
  console.error("[license-check] 检测到未授权的 Wine Fox / 酒狐模型被打入发布目录：");
  for (const file of leaked) console.error(`  - ${file}`);
  console.error("[license-check] Wine Fox 模型为 CC BY-NC-SA 4.0，不得随本发布包分发。");
  process.exit(1);
}

// 校验协议文件未被篡改
const sums = readFileSync(resolve(root, "LICENSES.sha256"), "utf8")
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => line.trim().split(/\s+/))
  .map(([hash, ...name]) => [hash, name.join(" ")]);

const mismatched = [];
for (const [expected, file] of sums) {
  const path = resolve(root, file);
  if (!existsSync(path)) {
    mismatched.push(`${file}（缺失）`);
    continue;
  }
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) mismatched.push(file);
}

if (mismatched.length > 0) {
  console.error("[license-check] 以下协议文件被修改或损坏：");
  for (const file of mismatched) console.error(`  - ${file}`);
  console.error("[license-check] 发布包要求原样保留完整协议，不得改动。");
  process.exit(1);
}

console.log("[license-check] 协议文件齐全且校验通过；Wine Fox 未进入发布目录。");
