// Subida por la API (V7-E) con dobles: firma → PUT con los encabezados exactos → complete; errores en español.
import { describe, expect, it, vi } from "vitest"
import { fileUrlWith, precheck, uploadWith, type FilesApi } from "./upload"

const H = new Headers()
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: "image/png" })

function fakeApi(over: Partial<FilesApi> = {}) {
  const calls: unknown[] = []
  const api: FilesApi = {
    createUpload: async (a) => (calls.push(["create", a.body]), { status: 200, headers: H, body: { ok: true, data: { uploadId: "t1", key: "u1/f.png", method: "PUT", uploadUrl: "https://bucket.test/u1/f.png?firma", headers: { "content-type": "image/png", "x-goog-content-length-range": "0,2097152" }, publicUrl: "https://files.test/avatars/u1/f.png" } } }),
    completeUpload: async (a) => (calls.push(["complete", a.body]), { status: 200, headers: H, body: { ok: true, data: { bucket: "avatars", key: "u1/f.png", size: 7, contentType: "image/png", publicUrl: "https://files.test/avatars/u1/f.png" } } }),
    url: async (a) => (calls.push(["url", a.query]), { status: 200, headers: H, body: { url: "https://bucket.test/firmada", expiresAt: null } }),
    ...over,
  }
  return { api, calls }
}

describe("uploadWith", () => {
  it("pide la firma con tamaño y tipo, sube con PUT y los encabezados firmados, y confirma", async () => {
    const { api, calls } = fakeApi()
    const f = vi.fn(async () => new Response(null, { status: 200 }))
    const r = await uploadWith(api, { bucket: "avatars", body: png(), name: "yo.png" }, f as unknown as typeof fetch)
    expect(calls[0]).toEqual(["create", { bucket: "avatars", bookId: undefined, folder: undefined, name: "yo.png", type: "image/png", size: 7 }])
    expect(f).toHaveBeenCalledWith("https://bucket.test/u1/f.png?firma", expect.objectContaining({ method: "PUT", headers: { "content-type": "image/png", "x-goog-content-length-range": "0,2097152" } }))
    expect(calls[1]).toEqual(["complete", { uploadId: "t1" }])
    expect(r.publicUrl).toBe("https://files.test/avatars/u1/f.png")
  })

  it("revisa tamaño y tipo antes de ir a la red", async () => {
    expect(precheck({ bucket: "feedback", body: new Blob(["%PDF"], { type: "application/pdf" }) })).toBe("Ese tipo de archivo no está permitido aquí.")
    expect(precheck({ bucket: "avatars", body: new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/png" }) })).toMatch(/máximo aquí es 2 MB/)
    const { api, calls } = fakeApi()
    await expect(uploadWith(api, { bucket: "avatars", body: new Blob([], { type: "image/png" }), name: "x.png" })).rejects.toThrow("El archivo está vacío.")
    expect(calls).toEqual([])
  })

  it("errores de la API y del almacenamiento con mensajes para la persona", async () => {
    const denied = fakeApi({ createUpload: async () => ({ status: 403, headers: H, body: { ok: false, code: "ROLE_DENIED", msg: "Solo puedes usar los archivos de tu propia carpeta." } }) })
    await expect(uploadWith(denied.api, { bucket: "avatars", body: png(), name: "a.png" })).rejects.toThrow("Solo puedes usar los archivos de tu propia carpeta.")
    const { api } = fakeApi()
    await expect(uploadWith(api, { bucket: "avatars", body: png(), name: "a.png" }, (async () => new Response(null, { status: 403 })) as unknown as typeof fetch)).rejects.toThrow(/no coincide/)
    await expect(uploadWith(api, { bucket: "avatars", body: png(), name: "a.png" }, (async () => { throw new TypeError("red") }) as unknown as typeof fetch)).rejects.toThrow(/Revisa tu conexión/)
  })
})

describe("fileUrlWith", () => {
  it("pide la URL (con descarga si se pide)", async () => {
    const { api, calls } = fakeApi()
    expect(await fileUrlWith(api, "attachments", "b/renta/2025/x.pdf", true)).toBe("https://bucket.test/firmada")
    expect(calls[0]).toEqual(["url", { bucket: "attachments", key: "b/renta/2025/x.pdf", download: "1" }])
  })
})
