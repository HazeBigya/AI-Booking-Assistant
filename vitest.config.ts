import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure Node environment — the booking core has no DOM/React dependency,
    // which is the whole point: it runs fast and without Docker.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
