import { defineConfig, devices } from "@playwright/test"

// apps/web/.env.local es un enlace a la .env.local de la raíz.
try { process.loadEnvFile?.(".env.local") } catch { /* en CI las variables vienen del entorno */ }
// La batería corre contra la web con TODO por la API. Lo normal es `pnpm e2e:local` (infra/local/e2e-local.mjs: base,
// API, tiempo real y web en este computador, con E2E_BASE_URL). Sin E2E_BASE_URL levanta `next start` y, si no hay
// E2E_API_URL, la API en local (:8080, `pnpm --filter api start` después de `pnpm --filter api build`).
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"
const PORT = Number(process.env.E2E_PORT ?? 3100)
// E2E_BASE_URL: correr contra una web ya levantada (pnpm e2e:local o un despliegue) en vez de levantar `next start`.
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

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
  use: { baseURL: BASE_URL, locale: "es-CO", timezoneId: "America/Bogota", trace: "retain-on-failure" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "movil", use: { ...devices["Pixel 7"], viewport: { width: 400, height: 860 } } },
  ],
  webServer: process.env.E2E_NO_SERVER || process.env.E2E_BASE_URL ? undefined : webServers(),
})

function webServers() {
  const api = process.env.E2E_API_URL
    ? []
    : [{ command: "pnpm --filter api start", cwd: "../..", url: `${API_URL}/healthz`, reuseExistingServer: true, timeout: 120_000, env: { PORT: new URL(API_URL).port || "8080", WEB_ORIGINS: BASE_URL } }]
  return [...api, { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000, env: { MIRAI_API_URL: API_URL } }]
}
