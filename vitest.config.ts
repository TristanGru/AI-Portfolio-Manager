import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environmentMatchGlobs: [
      ["src/client/**", "jsdom"],
      ["src/server/**", "node"],
      ["src/shared/**", "node"]
    ],
    setupFiles: ["src/client/tests/setup.ts"]
  }
});
