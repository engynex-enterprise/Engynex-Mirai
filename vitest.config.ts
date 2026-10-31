import path from "node:path"
import { defineConfig } from "vitest/config"

// Las pruebas corren con la hora de Colombia (como los usuarios de Mirai) para que las fechas
// locales sean las mismas en cualquier máquina o en CI.
process.env.TZ = "America/Bogota"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    // Pruebas unitarias (*.test.ts). Las E2E de Playwright (tests/e2e/*.spec.ts) van con `npm run test:e2e`.
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "legacy/**", "tests/e2e/**", ".next/**"],
    env: { TZ: "America/Bogota" },
    testTimeout: 30000,
  },
})
