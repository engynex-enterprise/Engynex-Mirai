import path from "node:path"
import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Las pruebas corren con la hora de Colombia (como los usuarios de Mirai) para que las fechas
// locales sean las mismas en cualquier máquina o en CI (preset de @mirai/config/vitest).
// Las del dominio (cálculos y paridad con la v4) viven en packages/domain.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: miraiTest({
    // Pruebas unitarias (*.test.ts). Las E2E de Playwright (tests/e2e/*.spec.ts) van con `pnpm test:e2e`.
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**", ".turbo/**"],
  }),
})
