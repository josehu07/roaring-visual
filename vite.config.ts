import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works when opened locally or
  // served from any path on any static host (root, subdirectory, etc.).
  base: "./",
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    setupFiles: ['./tests/setup.ts'],
    globals: true // disable to explicitly import vitest exports in test files
  }
});
