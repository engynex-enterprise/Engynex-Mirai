import { defineConfig, devices } from "@playwright/test"

// apps/web/.env.local es un enlace a la .env.local de la raíz (ver docs/DEPLOY-VERCEL.md › Monorepo).
try { process.loadEnvFile?.(".env.local") } catch { /* en CI las variables vienen del entorno */ }
// v6 F2-H-8: la batería corre en dos modos con la misma suite.
//   E2E_API=off (por defecto)  api-off: lo de hoy (Supabase directo, Server Actions y Route Handlers de Next)
//   E2E_API=on                 api-on: TODO por la API (MIRAI_API_ROLLOUT=all en `next start`, que se lee al correr,
//                              sin recompilar). La API sale de E2E_API_URL o se levanta en local (:8080, `pnpm --filter
//                              api start`, después de `pnpm --filter api build`). Contra un despliegue (E2E_BASE_URL) el
//                              modo lo decide ese despliegue: MIRAI_API_ROLLOUT=db y el usuario QA en api_rollout._users.
// Procedimiento: docs/arquitectura/v6-f2h-encendido.md › Pruebas E2E en dos modos.
const API_MODE = process.env.E2E_API === "on" ? "on" : "off"
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"
// Otro puerto en api-on: `reuseExistingServer` nunca toma por error un `next start` del otro modo.
const PORT = Number(process.env.E2E_PORT ?? (API_MODE === "on" ? 3101 : 3100))
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
  webServer: process.env.E2E_NO_SERVER || process.env.E2E_BASE_URL ? undefined : webServers(),
})

function webServers() {
  const web = { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 }
  if (API_MODE === "off") return web
  const api = process.env.E2E_API_URL
    ? []
    : [{ command: "pnpm --filter api start", cwd: "../..", url: `${API_URL}/healthz`, reuseExistingServer: true, timeout: 120_000, env: { PORT: new URL(API_URL).port || "8080", WEB_ORIGINS: BASE_URL } }]
  return [...api, { ...web, env: { MIRAI_API_ROLLOUT: "all", MIRAI_API_URL: API_URL } }]
}
