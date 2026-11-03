// Preset de Vitest de Mirai: hora de Colombia (como los usuarios) para que las fechas locales sean las mismas en
// cualquier máquina o en CI, entorno node y solo pruebas unitarias (*.test.ts). Las E2E van con Playwright.
process.env.TZ = "America/Bogota"

/**
 * @param {import("vitest/config").UserConfig["test"]} [test]
 * @returns {import("vitest/config").UserConfig["test"]}
 */
export function miraiTest(test = {}) {
  return {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**", ".next/**", ".turbo/**"],
    env: { TZ: "America/Bogota" },
    testTimeout: 30000,
    ...test,
  }
}
