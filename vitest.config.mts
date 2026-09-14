import { defineConfig } from "vitest/config";

// O importador de IFC é lógica pura: roda em Node, sem DOM e sem WASM.
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
