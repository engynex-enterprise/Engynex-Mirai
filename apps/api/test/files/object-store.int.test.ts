// V7-E: la misma batería para cada adaptador de ObjectStore. Memoria siempre; los de nube contra emuladores en Docker
// (se saltan si falta la variable, así `pnpm test` queda verde sin Docker):
//   FILES_TEST_S3_ENDPOINT=http://127.0.0.1:59400   MinIO   (docker run -p 127.0.0.1:59400:9000 -e MINIO_ROOT_USER=miraitest -e MINIO_ROOT_PASSWORD=miraitest-secret quay.io/minio/minio server /data)
//   FILES_TEST_GCS_ENDPOINT=http://127.0.0.1:59401  fake-gcs-server (docker run -p 127.0.0.1:59401:4443 fsouza/fake-gcs-server:1.52.2 -scheme http -port 4443 -external-url http://127.0.0.1:59401)
//   FILES_TEST_AZURITE=http://127.0.0.1:59402       Azurite (docker run -p 127.0.0.1:59402:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0 --skipApiVersionCheck --loose)
// Firmar, subir con la URL firmada (PUT real), leer (también por rango), listar por carpeta, borrar por prefijo y los
// límites que la firma impone (S3: tipo y tamaño exactos; GCS: rango de tamaño).
import { generateKeyPairSync, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { PhysicalBucket } from "../../src/core/files/buckets"
import { MemoryObjectStore } from "../../src/core/files/memory.object-store"
import type { ObjectStore } from "../../src/core/files/object-store"
import { contentMatches, sniffMime } from "../../src/core/files/sniff"

const S3 = process.env.FILES_TEST_S3_ENDPOINT
const GCS = process.env.FILES_TEST_GCS_ENDPOINT
const AZ = process.env.FILES_TEST_AZURITE
const run = randomUUID().slice(0, 8)
const buckets: Record<PhysicalBucket, string> = { private: `mirai-${run}-private`, backups: `mirai-${run}-backups`, public: `mirai-${run}-public` }
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)])
const AZURITE_KEY = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="

type Case = { name: string; skip: boolean; make: () => Promise<ObjectStore>; signedPut: boolean; strictSize?: "exact" | "range" }

const cases: Case[] = [
  { name: "memory", skip: false, make: async () => new MemoryObjectStore(), signedPut: false },
  {
    name: "s3 (MinIO)",
    skip: !S3,
    signedPut: true,
    strictSize: "exact",
    make: async () => {
      const { createS3ObjectStore } = await import("../../src/adapters/aws/object-store")
      const store = await createS3ObjectStore({ region: "us-east-1", endpoint: S3, forcePathStyle: true, buckets, credentials: { accessKeyId: "miraitest", secretAccessKey: "miraitest-secret" } })
      await store.ensureBuckets()
      return store
    },
  },
  {
    name: "gcs (fake-gcs-server)",
    skip: !GCS,
    signedPut: true,
    strictSize: "range",
    make: async () => {
      const { createGcsObjectStore } = await import("../../src/adapters/gcp/object-store")
      const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
      const store = await createGcsObjectStore({ buckets, endpoint: GCS, project: "mirai-test", credentials: { client_email: "firma@mirai-test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() } })
      await store.ensureBuckets()
      return store
    },
  },
  {
    name: "azure-blob (Azurite)",
    skip: !AZ,
    signedPut: true,
    make: async () => {
      const { createAzureBlobObjectStore } = await import("../../src/adapters/azure/object-store")
      const cs = `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=${AZURITE_KEY};BlobEndpoint=${AZ}/devstoreaccount1;`
      const store = await createAzureBlobObjectStore({ accounts: buckets, container: "objetos", connectionString: cs, endpoint: "https://{account}.blob.core.windows.net" })
      await store.ensureBuckets()
      return store
    },
  },
]

describe("sniff (tipo real por los primeros bytes)", () => {
  it("reconoce los tipos que acepta Mirai y rechaza el disfraz", () => {
    expect(sniffMime(PNG)).toBe("image/png")
    expect(sniffMime(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf")
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
    expect(sniffMime(Buffer.from("\0\0\0\x18ftypheic"))).toBe("image/heic")
    expect(sniffMime(Buffer.from("\0\0\0\x18ftypavif"))).toBe("image/avif")
    expect(sniffMime(Buffer.from(' {"book_id":1}'))).toBe("application/json")
    expect(contentMatches("image/png", Buffer.from("MZ\x90\0ejecutable"))).toBe(false)
    expect(contentMatches("image/heif", Buffer.from("\0\0\0\x18ftypheic"))).toBe(true)
    expect(contentMatches("text/csv", Buffer.from("a,b"))).toBe(true) // tipo que no sabemos reconocer: no se juzga
  })
})

for (const c of cases) {
  describe.skipIf(c.skip)(`ObjectStore ${c.name}`, () => {
    let store: ObjectStore
    const book = randomUUID()
    beforeAll(async () => {
      store = await c.make()
    }, 30_000)
    afterAll(async () => {
      if (!store) return
      for (const b of ["attachments", "backups", "avatars"] as const) await store.removePrefix(b, "").catch(() => 0)
    })

    it("escribe, lee (completo y por rango), head y lista por carpeta sin mezclar prefijos", async () => {
      await store.write({ bucket: "backups", key: `${book}/2026-11-02-manual.json`, body: '{"ok":true}', contentType: "application/json" })
      await store.write({ bucket: "attachments", key: `${book}/renta/2025/a.png`, body: PNG, contentType: "image/png" })
      await store.write({ bucket: "attachments", key: `${book}x/otro.png`, body: PNG, contentType: "image/png" })
      expect((await store.read({ bucket: "backups", key: `${book}/2026-11-02-manual.json` }))?.toString()).toBe('{"ok":true}')
      expect([...(await store.read({ bucket: "attachments", key: `${book}/renta/2025/a.png`, range: [0, 7] }))!]).toEqual([...PNG.subarray(0, 8)])
      expect(await store.head({ bucket: "attachments", key: `${book}/renta/2025/a.png` })).toMatchObject({ size: PNG.length, contentType: "image/png" })
      expect(await store.head({ bucket: "attachments", key: `${book}/no-existe.png` })).toBeNull()
      expect(await store.read({ bucket: "attachments", key: `${book}/no-existe.png` })).toBeNull()
      const keys = (await store.list({ bucket: "attachments", prefix: book })).map((o) => o.key)
      expect(keys).toEqual([`${book}/renta/2025/a.png`]) // `${book}x/…` es otra carpeta
      // El bucket lógico no se mezcla con otro que comparte el bucket físico.
      expect(await store.list({ bucket: "logos", prefix: book })).toEqual([])
    })

    it("borra por prefijo (supresión Ley 1581) y remove ignora lo que no existe", async () => {
      await store.write({ bucket: "avatars", key: `${book}/f1.webp`, body: "x", contentType: "image/webp" })
      await store.write({ bucket: "avatars", key: `${book}/sub/f2.webp`, body: "y", contentType: "image/webp" })
      expect(await store.removePrefix("avatars", book)).toBe(2)
      expect(await store.list({ bucket: "avatars", prefix: book })).toEqual([])
      expect(await store.remove("avatars", [`${book}/nada.webp`])).toBeLessThanOrEqual(1)
    })

    it("dirección pública con PUBLIC_FILES_URL o la del bucket", async () => {
      expect(store.publicUrl("avatars", `${book}/f.webp`)).toMatch(new RegExp(`avatars/${book}/f\\.webp$`))
    })

    it.skipIf(!c.signedPut)("sube con la URL firmada (PUT directo, como el navegador) y descarga con la firmada", async () => {
      const key = `${book}/subida/${randomUUID()}.png`
      const up = await store.signUpload({ bucket: "attachments", key, contentType: "image/png", maxBytes: 15 * 1024 * 1024, ttlS: 600, size: PNG.length })
      expect(new Date(up.expiresAt).getTime()).toBeGreaterThan(Date.now())
      const r = await fetch(up.url, { method: "PUT", headers: up.headers, body: PNG })
      expect(r.status, await r.clone().text()).toBeLessThan(300)
      expect(await store.head({ bucket: "attachments", key })).toMatchObject({ size: PNG.length, contentType: "image/png" })

      const dl = await store.signDownload({ bucket: "attachments", key, ttlS: 300 })
      const g = await fetch(dl)
      expect(g.status).toBe(200)
      expect(Buffer.from(await g.arrayBuffer()).equals(PNG)).toBe(true)
      const att = await store.signDownload({ bucket: "attachments", key, ttlS: 300, download: true, filename: "Certificado ñ.png" })
      if (c.name !== "gcs (fake-gcs-server)") expect((await fetch(att)).headers.get("content-disposition") ?? "").toContain("attachment")
    })

    it.skipIf(c.strictSize !== "exact")("S3: la firma no deja subir otro tamaño ni otro tipo", async () => {
      const key = `${book}/subida/${randomUUID()}.png`
      const up = await store.signUpload({ bucket: "attachments", key, contentType: "image/png", maxBytes: 1000, ttlS: 600, size: PNG.length })
      expect((await fetch(up.url, { method: "PUT", headers: up.headers, body: Buffer.concat([PNG, Buffer.alloc(10)]) })).status).toBe(403)
      expect((await fetch(up.url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: PNG })).status).toBe(403)
      expect(await store.head({ bucket: "attachments", key })).toBeNull()
    })

    it.skipIf(c.strictSize !== "range")("GCS: la subida firma x-goog-content-length-range con el máximo del bucket", async () => {
      const up = await store.signUpload({ bucket: "feedback", key: `${book}/x.png`, contentType: "image/png", maxBytes: 5 * 1024 * 1024, ttlS: 600 })
      expect(up.headers["x-goog-content-length-range"]).toBe(`0,${5 * 1024 * 1024}`)
      expect(new URL(up.url).searchParams.get("X-Goog-SignedHeaders")).toContain("x-goog-content-length-range")
    })
  })
}
