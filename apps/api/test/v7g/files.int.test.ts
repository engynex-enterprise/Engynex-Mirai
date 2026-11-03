// V7-G (E14): archivos con el puerto ObjectStore en memoria. Reglas por bucket (libro, carpeta propia, consola),
// tamaño y tipo, ruta armada por el servidor, ticket de subida que no se puede falsificar ni usar otra persona,
// URL firmadas de 5 min, borrar, límite y errores en español.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MemoryObjectStore } from "../../src/core/files/memory.object-store"
import { ObjectStore } from "../../src/core/files/object-store"
import { safeName } from "../../src/modules/files/files.service"
import { B_AJENO, B_GRATIS, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const store = new MemoryObjectStore()
const up = (body: Record<string, unknown>, role: Parameters<V7gApp["call"]>[2] = "editor", h: Record<string, string> = {}) => t.call("POST", "/v1/files/uploads", role, body, h)

beforeAll(async () => {
  t = await createV7gApp({ overrides: [[ObjectStore, store]] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => store.objects.clear())

describe("safeName", () => {
  it("quita tildes, espacios y caracteres raros, y conserva la extensión", () => {
    expect(safeName("Certificado de ingresos 2025 (Ñoño).pdf")).toBe("Certificado-de-ingresos-2025-Nono-.pdf")
    expect(safeName("../../etc/passwd")).toBe("etc-passwd")
    expect(safeName("???")).toBe("archivo")
  })
})

describe("POST /v1/files/uploads + complete", () => {
  it("adjunto del libro: «Edita» recibe la URL; la ruta empieza por el libro y la arma el servidor", async () => {
    const r = await up({ bucket: "attachments", bookId: B_GRATIS, folder: "renta/2025", name: "Certificado 2025.pdf", type: "application/pdf", size: 120_000 })
    expect(r.status).toBe(200)
    const d = r.body.data as { key: string; uploadId: string; method: string; uploadUrl: string; publicUrl: string | null; headers: Record<string, string> }
    expect(d.key).toMatch(new RegExp(`^${B_GRATIS}/renta/2025/[0-9a-f-]{36}-Certificado-2025\\.pdf$`))
    expect(d).toMatchObject({ method: "PUT", publicUrl: null, headers: { "content-type": "application/pdf" } })

    // El navegador sube directo (aquí: simulado) y confirma.
    store.put("attachments", d.key, { size: 120_000, contentType: "application/pdf" })
    const c = await t.call("POST", "/v1/files/uploads/complete", "editor", { uploadId: d.uploadId })
    expect(c.body).toEqual({ ok: true, data: { bucket: "attachments", key: d.key, size: 120_000, contentType: "application/pdf", publicUrl: null } })
  })

  it("«Registra» o «Ver» no suben al libro (403); un libro ajeno es 404; falta el libro es 400", async () => {
    const body = { bucket: "attachments", bookId: B_GRATIS, name: "a.pdf", type: "application/pdf", size: 10 }
    expect((await up(body, "registra")).body).toMatchObject({ code: "ROLE_DENIED" })
    expect((await up(body, "viewer")).status).toBe(403)
    expect((await up({ ...body, bookId: B_AJENO }, "owner")).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese libro." })
    expect((await up({ ...body, bookId: undefined }, "owner")).body).toMatchObject({ code: "VALIDATION", msg: "Falta el libro del archivo." })
  })

  it("tamaño y tipo de cada bucket (mensajes en español)", async () => {
    expect((await up({ bucket: "avatars", name: "foto.png", type: "image/png", size: 3 * 1024 * 1024 }, "viewer")).body).toMatchObject({ code: "VALIDATION", msg: "El archivo pesa 3 MB: el máximo aquí es 2 MB." })
    expect((await up({ bucket: "feedback", name: "x.pdf", type: "application/pdf", size: 100 }, "viewer")).body).toMatchObject({ msg: "Ese tipo de archivo no está permitido aquí. Usa PNG, JPG, WebP, GIF." })
    expect((await up({ bucket: "backups", name: "x.json", type: "application/json", size: 100 }, "owner")).body).toMatchObject({ code: "VALIDATION" })
  })

  it("avatar: siempre en la carpeta de la persona y con su dirección pública", async () => {
    const r = await up({ bucket: "avatars", name: "yo.webp", type: "image/webp", size: 50_000 }, "viewer")
    const d = r.body.data as { key: string; publicUrl: string }
    expect(d.key).toMatch(new RegExp(`^${USERS.viewer}/[0-9a-f-]{36}\\.webp$`))
    expect(d.publicUrl).toBe(`https://files.mirai.test/avatars/${d.key}`)
  })

  it("anuncios y archivos públicos: solo el administrador de la plataforma", async () => {
    expect((await up({ bucket: "ads", name: "a.png", type: "image/png", size: 100 }, "editor")).body).toMatchObject({ code: "ROLE_DENIED", msg: "Solo el administrador de Mirai puede subir estos archivos." })
    const r = await up({ bucket: "public-assets", name: "plantilla.jpg", type: "image/jpeg", size: 100 }, "owner") // el dueño de prueba es admin
    expect((r.body.data as { key: string }).key).toMatch(/^whatsapp\/[0-9a-f-]{36}\.jpg$/)
  })

  it("complete: otra persona, un ticket falso o un archivo que no llegó → 404; si no cumple los límites, se borra", async () => {
    const r = await up({ bucket: "feedback", name: "captura.png", type: "image/png", size: 1000 }, "viewer")
    const d = r.body.data as { key: string; uploadId: string }
    expect((await t.call("POST", "/v1/files/uploads/complete", "editor", { uploadId: d.uploadId })).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos esa subida. Vuelve a subir el archivo." })
    expect((await t.call("POST", "/v1/files/uploads/complete", "viewer", { uploadId: `${d.uploadId.slice(0, -4)}AAAA` })).status).toBe(404)
    expect((await t.call("POST", "/v1/files/uploads/complete", "viewer", { uploadId: d.uploadId })).body).toMatchObject({ msg: "No encontramos el archivo subido. Vuelve a subirlo." })
    store.put("feedback", d.key, { size: 9 * 1024 * 1024, contentType: "image/png" })
    expect((await t.call("POST", "/v1/files/uploads/complete", "viewer", { uploadId: d.uploadId })).body).toMatchObject({ code: "VALIDATION" })
    expect(store.objects.has(`feedback/${d.key}`)).toBe(false)
  })

  it("con Idempotency-Key, repetir devuelve la misma ruta", async () => {
    const h = { "idempotency-key": "subida-avatar-123456" }
    const body = { bucket: "avatars", name: "yo.png", type: "image/png", size: 10 }
    const a = await up(body, "viewer", h)
    const b = await up(body, "viewer", h)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect((b.body.data as { key: string }).key).toBe((a.body.data as { key: string }).key)
  })
})

describe("GET /v1/files/url y DELETE /v1/files", () => {
  it("privado: URL firmada de 5 min para cualquier rol del libro; ajeno → 404", async () => {
    const key = `${B_GRATIS}/renta/2025/x.pdf`
    store.put("attachments", key, { size: 10, contentType: "application/pdf" })
    const r = await t.call("GET", `/v1/files/url?bucket=attachments&key=${encodeURIComponent(key)}&download=1`, "viewer")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ url: `https://files.mirai.test/signed/attachments/${key}?ttl=300&download=1` })
    expect(typeof r.body.expiresAt).toBe("string")
    expect((await t.call("GET", `/v1/files/url?bucket=attachments&key=${encodeURIComponent(`${B_AJENO}/x.pdf`)}`, "owner")).status).toBe(404)
    expect((await t.call("GET", `/v1/files/url?bucket=attachments&key=${encodeURIComponent("../x.pdf")}`, "owner")).body).toMatchObject({ code: "VALIDATION" })
  })

  it("capturas de opiniones: la persona y la consola; nadie más", async () => {
    const key = `${USERS.viewer}/c.png`
    store.put("feedback", key, { size: 10, contentType: "image/png" })
    const q = `/v1/files/url?bucket=feedback&key=${encodeURIComponent(key)}`
    expect((await t.call("GET", q, "viewer")).status).toBe(200)
    expect((await t.call("GET", q, "owner")).status).toBe(200) // administrador de la plataforma
    expect((await t.call("GET", q, "editor")).body).toMatchObject({ code: "ROLE_DENIED" })
  })

  it("borrar: mismas reglas que subir", async () => {
    const key = `${B_GRATIS}/x.pdf`
    store.put("attachments", key, { size: 10, contentType: "application/pdf" })
    expect((await t.call("DELETE", "/v1/files", "viewer", { bucket: "attachments", key })).status).toBe(403)
    expect((await t.call("DELETE", "/v1/files", "editor", { bucket: "attachments", key })).body).toEqual({ ok: true, data: { deleted: true } })
    expect((await t.call("DELETE", "/v1/files", "editor", { bucket: "attachments", key })).body).toEqual({ ok: true, data: { deleted: false } })
  })

  it("sin sesión → 401", async () => {
    expect((await t.call("POST", "/v1/files/uploads", null, { bucket: "avatars", name: "a.png", type: "image/png", size: 1 })).status).toBe(401)
  })
})
