import { defineConfig, devices } from "@playwright/test"

// apps/web/.env.local es un enlace a la .env.local de la raíz (ver docs/DEPLOY-VERCEL.md › Monorepo).
try { process.loadEnvFile?.(".env.local") } catch { /* en CI las variables vienen del entorno */ }
const PORT = Number(process.env.E2E_PORT ?? 3100)
// E2E_BASE_URL: correr contra un despliegue (p. ej. pruebas en Vercel, CI) en vez de levantar `next start`.
// Si el despliegue está protegido, VERCEL_AUTOMATION_BYPASS_SECRET abre la protección de Vercel.
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "tests/.out/results",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // Todas las pruebas comparten el usuario QA y su libro activo: un reintento absorbe interferencias de estado.
  retries: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL, locale: "es-CO", timezoneId: "America/Bogota", trace: "retain-on-failure",
    ...(BYPASS ? { extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } } : {}),
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "movil", use: { ...devices["Pixel 7"], viewport: { width: 400, height: 860 } } },
  ],
  webServer: process.env.E2E_NO_SERVER || process.env.E2E_BASE_URL ? undefined : { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
})
