import { defineConfig } from "vite";
import { resolve } from "node:path";

// Standalone UMD: bundles three + fflate so it can be used with a single
// <script> tag, without a global THREE build.
export default defineConfig({
  base: "./",
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "MCModelKit",
      fileName: () => "mc-model-kit.standalone.umd.cjs",
      formats: ["umd"],
    },
    rollupOptions: {
      external: [],
    },
    copyPublicDir: false,
    emptyOutDir: false,
    sourcemap: true,
  },
});
