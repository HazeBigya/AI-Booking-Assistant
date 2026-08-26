import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@server": resolve(__dirname, "src/server"),
      "@client": resolve(__dirname, "src/client"),
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The clinic zone otherwise defaults to whatever machine runs the suite, so
    // pin it: these assertions are about the logic, not about where you live.
    env: { CLINIC_TIMEZONE: "UTC" },
  },
});
