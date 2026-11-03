// Capturas REALES de Mirai para el diálogo de instalación de Android/Chrome (manifest › screenshots). Reemplaza las de
// muestra que dibuja scripts/pwa-assets.mjs. Usa Playwright con una cuenta que ya tenga datos (idealmente un libro de
// ejemplo, nunca datos de una persona real).
//
// Uso (con la app corriendo, p. ej. npm run dev o npx next start -p 3100):
//   BASE_URL=http://localhost:3100 PWA_EMAIL=demo@mirai.test PWA_PASSWORD=… npm run pwa:screenshots
// Después, si vuelves a correr pwa:assets, usa `npm run pwa:assets -- --sin-capturas` para no pisarlas.
// Los nombres y tamaños deben coincidir con lib/pwa/manifest.ts › MANIFEST_SCREENSHOTS (la prueba lo revisa).
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

process.loadEnvFile?.(".env.local")
const BASE = process.env.BASE_URL ?? "http://localhost:3100"
const EMAIL = process.env.PWA_EMAIL ?? process.env.E2E_QA_EMAIL
const PASS = process.env.PWA_PASSWORD ?? process.env.E2E_QA_PASSWORD
if (!EMAIL || !PASS) { console.error("Falta PWA_EMAIL y PWA_PASSWORD (o E2E_QA_EMAIL/E2E_QA_PASSWORD en .env.local)."); process.exit(1) }

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/pwa/capturas")
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  { file: "escritorio-inicio.png", path: "/inicio", w: 1280, h: 800, dpr: 1 },
  { file: "escritorio-balance.png", path: "/balance", w: 1280, h: 800, dpr: 1 },
  { file: "celular-inicio.png", path: "/inicio", w: 412, h: 915, dpr: 2, mobile: true },
  { file: "celular-gasto.png", path: "/gastos?nuevo=1", w: 412, h: 915, dpr: 2, mobile: true },
  { file: "celular-deudas.png", path: "/le-debo", w: 412, h: 915, dpr: 2, mobile: true },
]

const browser = await chromium.launch()
try {
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: !!s.mobile, hasTouch: !!s.mobile, locale: "es-CO", timezoneId: "America/Bogota", colorScheme: "light" })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/login`)
    await page.getByLabel("Correo").fill(EMAIL)
    await page.getByLabel("Contraseña", { exact: true }).fill(PASS)
    await page.getByRole("button", { name: "Entrar" }).click()
    await page.waitForURL(/\/(inicio|puesta)/, { timeout: 30_000 })
    await page.goto(`${BASE}${s.path}`)
    await page.waitForLoadState("networkidle").catch(() => {})
    // Sin anuncios, avisos ni la burbuja del chat en la foto.
    await page.addStyleTag({ content: "[data-sonner-toaster],.install-banner,[aria-label^='Pregúntale a Mirai']{display:none!important}" })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(OUT, s.file) })
    console.log("✓", s.file)
    await ctx.close()
  }
} finally {
  await browser.close()
}
