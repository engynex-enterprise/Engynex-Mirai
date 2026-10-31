import { defineConfig, devices } from "@playwright/test"

process.loadEnvFile?.(".env.local")
const PORT = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "tests/.out/results",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, locale: "es-CO", timezoneId: "America/Bogota", trace: "retain-on-failure" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "movil", use: { ...devices["Pixel 7"], viewport: { width: 400, height: 860 } } },
  ],
  webServer: process.env.E2E_NO_SERVER ? undefined : { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
})
