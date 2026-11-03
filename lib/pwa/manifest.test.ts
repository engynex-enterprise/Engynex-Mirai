import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildManifest } from "./manifest"
import { PWA_SHORTCUTS, PWA_START_URL } from "./config"
import { APPLE_DEVICES, splashImages } from "./splash"

const root = join(__dirname, "../..")
const pub = (src: string) => join(root, "public", src.replace(/^\//, ""))
const m = buildManifest()

/** Dimensiones de un PNG (cabecera IHDR). */
const pngSize = (f: string) => { const b = readFileSync(f); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` }

describe("manifest de Mirai instalado", () => {
  it("identidad estable, inicio, alcance y presentación de app", () => {
    // id = la start_url de antes: cambiarla duplicaría las instalaciones que ya existen.
    expect(m.id).toBe("/inicio")
    expect(m.start_url).toBe(PWA_START_URL)
    expect(m.start_url!.startsWith(m.scope!)).toBe(true)
    expect(m.display).toBe("standalone")
    expect(m.display_override).toContain("window-controls-overlay")
    expect(m.lang).toBe("es-CO")
    expect(m.categories).toContain("finance")
    expect(m.prefer_related_applications).toBe(false)
    expect(m.theme_color).toMatch(/^#[0-9A-F]{6}$/i)
    expect(m.background_color).toMatch(/^#[0-9A-F]{6}$/i)
    expect(m.launch_handler?.client_mode).toContain("focus-existing")
    expect(m.handle_links).toBe("preferred")
  })

  it("íconos any y maskable de 192 y 512 que existen con su tamaño real", () => {
    for (const purpose of ["any", "maskable"]) for (const size of ["192x192", "512x512"]) expect(m.icons!.some((i) => i.purpose === purpose && i.sizes === size)).toBe(true)
    for (const i of m.icons!) {
      expect(existsSync(pub(i.src)), i.src).toBe(true)
      expect(pngSize(pub(i.src))).toBe(i.sizes)
    }
    expect(pngSize(pub("/pwa/apple-touch-icon.png"))).toBe("180x180")
  })

  it("capturas anchas y angostas para el diálogo de instalación de Android/Chrome", () => {
    const s = m.screenshots!
    expect(s.some((x) => x.form_factor === "wide")).toBe(true)
    expect(s.some((x) => x.form_factor === "narrow")).toBe(true)
    for (const x of s) {
      expect(existsSync(pub(x.src)), x.src).toBe(true)
      expect(pngSize(pub(x.src))).toBe(x.sizes)
      expect(x.label).toBeTruthy()
      const [w, h] = x.sizes!.split("x").map(Number) as [number, number]
      // Chrome: entre 320 y 3840 px y una proporción máxima de 2,3.
      expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3)
    }
  })

  it("compartir a Mirai (factura en foto o PDF) por POST multipart", () => {
    const st = m.share_target!
    expect(st.method).toBe("POST")
    expect(st.enctype).toBe("multipart/form-data")
    const files = ([] as { name: string; accept: string | string[] }[]).concat(st.params.files ?? [])
    expect(files[0]?.accept).toContain("image/*")
    expect(files[0]?.accept).toContain("application/pdf")
    expect(existsSync(join(root, "app", st.action.replace(/^\//, ""), "route.ts"))).toBe(true)
    // El service worker atiende la misma ruta y el mismo campo.
    const sw = readFileSync(pub("/sw.js"), "utf8")
    expect(sw).toContain(`SHARE_ACTION = "${st.action}"`)
    expect(sw).toContain(`SHARE_FIELD = "${files[0]!.name}"`)
  })

  it("protocolo web+mirai y archivos CSV/Excel para Importar", () => {
    expect(m.protocol_handlers?.[0]?.protocol).toBe("web+mirai")
    expect(m.protocol_handlers?.[0]?.url).toContain("%s")
    expect(m.file_handlers?.[0]?.action).toBe("/importar")
    expect(Object.values(m.file_handlers![0]!.accept).flat()).toEqual(expect.arrayContaining([".csv", ".xlsx"]))
  })
})

describe("accesos directos", () => {
  const sc = m.shortcuts!

  it("gasto, ingreso, deuda, préstamo y recordatorio primero, en ese orden", () => {
    expect(sc.slice(0, 5).map((s) => s.url)).toEqual(["/gastos?nuevo=1", "/ingresos?nuevo=1", "/le-debo?nuevo=1", "/me-deben?nuevo=1", "/calendario?nuevo=1"])
    expect(sc.length).toBeLessThanOrEqual(10)
  })

  it("cada uno lleva a una sección que existe y que abre el formulario con ?nuevo", () => {
    for (const s of PWA_SHORTCUTS) {
      const u = new URL(s.url, "https://mirai.test")
      const seg = u.pathname.slice(1)
      const page = join(root, "app/(app)", seg, "page.tsx")
      expect(existsSync(page), `${s.id}: falta ${page}`).toBe(true)
      if (u.searchParams.has("nuevo")) {
        // La vista de esa página lee ?nuevo= con useNewParam().
        const src = readFileSync(page, "utf8")
        const view = src.match(/from "@\/features\/([^"]+)"/g)?.map((x) => x.slice(6, -1).replace("@/", "")) ?? []
        const uses = view.some((v) => { const f = join(root, `${v}.tsx`); return existsSync(f) && readFileSync(f, "utf8").includes("useNewParam") })
        expect(uses, `${s.id}: la vista de /${seg} no usa useNewParam`).toBe(true)
      }
    }
  })

  it("nombres cortos, descripción e íconos de 96 px que existen", () => {
    for (const s of sc) {
      expect(s.short_name!.length).toBeLessThanOrEqual(12)
      expect(s.name.length).toBeLessThanOrEqual(30)
      expect(s.description).toBeTruthy()
      const i96 = s.icons!.find((i) => i.sizes === "96x96")!
      expect(existsSync(pub(i96.src)), i96.src).toBe(true)
      expect(pngSize(pub(i96.src))).toBe("96x96")
    }
  })

  it("ids e isotipos válidos", () => {
    const iso = JSON.parse(readFileSync(join(root, "lib/data/iso.json"), "utf8")) as { icons: Record<string, string> }
    expect(new Set(PWA_SHORTCUTS.map((s) => s.id)).size).toBe(PWA_SHORTCUTS.length)
    for (const s of PWA_SHORTCUTS) expect(iso.icons[s.iso], s.iso).toBeTruthy()
  })
})

describe("pantallas de inicio de iPhone y iPad", () => {
  const list = splashImages()
  it("claro y oscuro para cada pantalla; iPad también en horizontal", () => {
    const tablets = APPLE_DEVICES.filter((d) => d.tablet).length
    expect(list.length).toBe((APPLE_DEVICES.length + tablets) * 2)
    expect(list.filter((s) => s.scheme === "dark").length).toBe(list.length / 2)
    // Primero las oscuras: iOS usa la primera que coincide.
    expect(list[0]!.scheme).toBe("dark")
  })
  it("cada archivo existe con el tamaño exacto de la pantalla", () => {
    for (const s of list) {
      expect(existsSync(pub(s.url)), s.url).toBe(true)
      expect(pngSize(pub(s.url))).toBe(`${s.width}x${s.height}`)
      expect(s.media).toContain("-webkit-device-pixel-ratio")
    }
  })
})

describe("service worker", () => {
  const sw = readFileSync(pub("/sw.js"), "utf8")
  it("no guarda datos privados ni páginas, y tiene página offline", () => {
    for (const p of ["/api/", "/auth/", "_rsc", "RSC"]) expect(sw).toContain(p)
    expect(sw).toContain('OFFLINE = "/offline.html"')
    expect(existsSync(pub("/offline.html"))).toBe(true)
    // Nunca se guarda la respuesta de una navegación (traería datos de la persona).
    expect(sw).not.toMatch(/navigate[\s\S]{0,300}cache\.put/)
  })
  it("conserva el push y la apertura al tocar la notificación", () => {
    expect(sw).toContain('addEventListener("push"')
    expect(sw).toContain('addEventListener("notificationclick"')
    expect(sw).toContain("SKIP_WAITING")
  })
})
