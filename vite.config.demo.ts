import { defineConfig } from "vite";
import { resolve } from "node:path";

/** 构建可部署到 GitHub Pages 的交互 Demo。 */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-demo",
    copyPublicDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
