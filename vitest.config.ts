import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: local("./src") },
      // Vitest loads PanelUI outside the module graph, where a test's react-native mock cannot reach it.
      { find: /^panelui-native\/hooks\/use-back-handler$/, replacement: local("./src/ui/back-handler-test-double.ts") },
    ],
  },
  // Route files (app/) and component tests (.test.tsx) are collected too, so no test silently never runs.
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "modules/*/{src,js}/**/*.test.ts"], reporters: ["default"] },
});
