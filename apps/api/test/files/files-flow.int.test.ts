// V7-E: flujo de punta a punta por HTTP de la API con un almacenamiento real (MinIO, compatible con S3):
// POST /v1/files/uploads → PUT directo a la URL firmada → POST /v1/files/uploads/complete → GET /v1/files/url → DELETE.
// Y lo que la firma y complete() no dejan pasar (archivo disfrazado). Se salta sin FILES_TEST_S3_ENDPOINT.
// Además, sin Docker: OBJECT_STORE elige el adaptador de los módulos (respaldos) y la configuración se valida.
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadFilesConfig } from "../../src/core/files/files.config"
import { MemoryObjectStore } from "../../src/core/files/memory.object-store"
import { ObjectStore } from "../../src/core/files/object-store"
import { createObjectStore } from "../../src/core/files/object-store.module"
import { BackupStorage } from "../../src/modules/import/backup-storage"
import { ObjectStoreBackupStorage } from "../../src/modules/import/object-store.backup-storage"
import { B_GRATIS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "../v7g/app"

const S3 = process.env.FILES_TEST_S3_ENDPOINT
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 3)])

describe("files.config (OBJECT_STORE y buckets)", () => {
  it("por defecto Supabase; gcs/s3 exigen los tres buckets y s3 la región", () => {
    expect(loadFilesConfig({}).driver).toBe("supabase")
    expect(() => loadFilesConfig({ OBJECT_STORE: "gcs" })).toThrow(/STORAGE_BUCKET_PRIVATE/)
    expect(() => loadFilesConfig({ OBJECT_STORE: "s3", STORAGE_BUCKET_PRIVATE: "a", STORAGE_BUCKET_BACKUPS: "b", STORAGE_BUCKET_PUBLIC: "c" })).toThrow(/S3_REGION/)
    const az = loadFilesConfig({ OBJECT_STORE: "azure-blob", STORAGE_BUCKET_PRIVATE: "mpriv", STORAGE_BUCKET_BACKUPS: "mbak", STORAGE_BUCKET_PUBLIC: "mpub", PUBLIC_FILES_URL: "https://files.mirai.engynex.com/" })
    expect(az.azure).toMatchObject({ accounts: { private: "mpriv", backups: "mbak", public: "mpub" }, container: "objetos" })
    expect(az.publicBaseUrl).toBe("https://files.mirai.engynex.com")
  })
  it("los errores nombran la variable, nunca un valor", () => {
    try {
      loadFilesConfig({ OBJECT_STORE: "s3", S3_ENDPOINT: "no-es-url" })
    } catch (e) {
      expect(String(e)).toContain("S3_ENDPOINT")
      expect(String(e)).not.toContain("no-es-url")
    }
  })
})

describe("OBJECT_STORE elige el adaptador de los módulos", () => {
  it("con Supabase, el adaptador de siempre; con otro, el que usa el puerto", async () => {
    const { byObjectStore } = await import("../../src/core/files/by-driver")
    class SupabaseLike {}
    const p = byObjectStore(BackupStorage, SupabaseLike as never, ObjectStoreBackupStorage) as unknown as { useFactory: (s: ObjectStore, r: { create: (c: unknown) => unknown }) => unknown }
    const ref = { create: (c: unknown) => c }
    expect(p.useFactory(new MemoryObjectStore(), ref)).toBe(ObjectStoreBackupStorage)
    expect(p.useFactory({ driver: "supabase" } as ObjectStore, ref)).toBe(SupabaseLike)
  })
})

describe.skipIf(!S3)("flujo de archivos por la API con MinIO (S3)", () => {
  let t: V7gApp
  let store: ObjectStore
  const run = randomUUID().slice(0, 8)
  const buckets = { private: `mirai-${run}-private`, backups: `mirai-${run}-backups`, public: `mirai-${run}-public` }

  beforeAll(async () => {
    // La cadena estándar del SDK lee las credenciales del entorno (en la nube: el rol de la tarea).
    process.env.AWS_ACCESS_KEY_ID = "miraitest"
    process.env.AWS_SECRET_ACCESS_KEY = "miraitest-secret"
    store = await createObjectStore(loadFilesConfig({ OBJECT_STORE: "s3", S3_ENDPOINT: S3, S3_REGION: "us-east-1", S3_FORCE_PATH_STYLE: "1", STORAGE_BUCKET_PRIVATE: buckets.private, STORAGE_BUCKET_BACKUPS: buckets.backups, STORAGE_BUCKET_PUBLIC: buckets.public, PUBLIC_FILES_URL: "https://files.mirai.test" }))
    await (store as unknown as { ensureBuckets: () => Promise<void> }).ensureBuckets()
    t = await createV7gApp({ overrides: [[ObjectStore, store]] })
  }, 30_000)
  afterAll(async () => {
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    await t?.close()
  })

  const create = (body: Record<string, unknown>, role: Parameters<V7gApp["call"]>[2] = "editor") => t.call("POST", "/v1/files/uploads", role, body)

  it("adjunto de renta: firma → PUT → complete → URL de 5 min → borrar", async () => {
    const r = await create({ bucket: "attachments", bookId: B_GRATIS, folder: "renta/2025", name: "Factura.png", type: "image/png", size: PNG.length })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const d = r.body.data as { uploadId: string; key: string; uploadUrl: string; headers: Record<string, string> }
    expect(d.key.startsWith(`${B_GRATIS}/renta/2025/`)).toBe(true)
    const put = await fetch(d.uploadUrl, { method: "PUT", headers: d.headers, body: PNG })
    expect(put.status).toBe(200)

    const c = await t.call("POST", "/v1/files/uploads/complete", "editor", { uploadId: d.uploadId })
    expect(c.body).toMatchObject({ ok: true, data: { bucket: "attachments", key: d.key, size: PNG.length, contentType: "image/png", publicUrl: null } })

    const u = await t.call("GET", `/v1/files/url?bucket=attachments&key=${encodeURIComponent(d.key)}`, "viewer")
    expect(u.status).toBe(200)
    const got = await fetch((u.body as unknown as { url: string }).url)
    expect(Buffer.from(await got.arrayBuffer()).equals(PNG)).toBe(true)

    const del = await t.call("DELETE", "/v1/files", "editor", { bucket: "attachments", key: d.key })
    expect(del.body).toMatchObject({ ok: true, data: { deleted: true } })
    expect(await store.head({ bucket: "attachments", key: d.key })).toBeNull()
  })

  it("un ejecutable disfrazado de PNG se rechaza al completar y no se queda guardado", async () => {
    const fake = Buffer.concat([Buffer.from("MZ\x90\0"), Buffer.alloc(100)])
    const r = await create({ bucket: "avatars", name: "yo.png", type: "image/png", size: fake.length }, "viewer")
    const d = r.body.data as { uploadId: string; key: string; uploadUrl: string; headers: Record<string, string>; publicUrl: string }
    expect(d.publicUrl).toBe(`https://files.mirai.test/avatars/${d.key}`)
    expect((await fetch(d.uploadUrl, { method: "PUT", headers: d.headers, body: fake })).status).toBe(200)
    const c = await t.call("POST", "/v1/files/uploads/complete", "viewer", { uploadId: d.uploadId })
    expect(c.body).toMatchObject({ code: "VALIDATION", msg: "El contenido del archivo no corresponde a su tipo. Vuelve a elegirlo." })
    expect(await store.head({ bucket: "avatars", key: d.key })).toBeNull()
  })

  it("subir más bytes de los declarados falla en el almacenamiento (firma de content-length)", async () => {
    const r = await create({ bucket: "feedback", name: "captura.png", type: "image/png", size: PNG.length }, "viewer")
    const d = r.body.data as { uploadUrl: string; headers: Record<string, string> }
    expect((await fetch(d.uploadUrl, { method: "PUT", headers: d.headers, body: Buffer.concat([PNG, PNG]) })).status).toBe(403)
  })
})
