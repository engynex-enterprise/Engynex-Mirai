// V7-E: copia de Supabase Storage al ObjectStore destino contra un Storage de Supabase SIMULADO (servidor HTTP local
// con las rutas /storage/v1/bucket, /object/list/:b y /object/:b/:ruta). Nunca toca Supabase real.
// Destino: memoria siempre; MinIO si FILES_TEST_S3_ENDPOINT existe. Revisa lista recursiva, rutas sin cambios,
// idempotencia (la segunda pasada no copia nada), simulación (--dry-run) y la protección de la línea de comandos.
import { createHash, randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadFilesConfig } from "../../src/core/files/files.config"
import { MemoryObjectStore } from "../../src/core/files/memory.object-store"
import type { ObjectStore } from "../../src/core/files/object-store"
import { createObjectStore } from "../../src/core/files/object-store.module"
import { copyStorage, main, SupabaseRestSource } from "../../src/tools/storage-copy"

const KEY = "sb_secret_de_prueba"
const BOOK = randomUUID()
const USER = randomUUID()
const FILES: Record<string, Record<string, { body: Buffer; type: string }>> = {
  attachments: { [`${BOOK}/renta/2025/${randomUUID()}-cert.pdf`]: { body: Buffer.from("%PDF-1.7 certificado"), type: "application/pdf" }, [`${BOOK}/gasto.png`]: { body: Buffer.from("\x89PNG\r\n\x1a\nimagen"), type: "image/png" } },
  backups: { [`${BOOK}/2026-11-02T10-00-00-000Z-manual.json`]: { body: Buffer.from('{"version":5}'), type: "application/json" } },
  avatars: { [`${USER}/${randomUUID()}.webp`]: { body: Buffer.from("RIFF0000WEBPfoto"), type: "image/webp" } },
  logos: {},
  "otro-bucket": { "x.txt": { body: Buffer.from("no es de Mirai"), type: "text/plain" } },
}
let calls: string[] = []

/** Supabase Storage de mentiras: la misma forma de respuesta que la API real (carpetas con id null). */
function fakeSupabase(): Server {
  return createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`)
    if (req.headers.authorization !== `Bearer ${KEY}`) return res.writeHead(401).end()
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname === "/storage/v1/bucket") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(Object.keys(FILES).map((id) => ({ id }))))
    const list = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(url.pathname)
    if (list && req.method === "POST") {
      let raw = ""
      req.on("data", (c) => (raw += c))
      req.on("end", () => {
        const { prefix = "", offset = 0 } = JSON.parse(raw) as { prefix?: string; offset?: number }
        const bucket = decodeURIComponent(list[1])
        const p = prefix ? `${prefix}/` : ""
        const seen = new Map<string, unknown>()
        for (const [k, f] of Object.entries(FILES[bucket] ?? {})) {
          if (!k.startsWith(p)) continue
          const rest = k.slice(p.length)
          const name = rest.split("/")[0]
          if (rest.includes("/")) seen.set(name, { name, id: null, metadata: null })
          else seen.set(name, { name, id: randomUUID(), metadata: { size: f.body.length, mimetype: f.type, eTag: `"${createHash("md5").update(f.body).digest("hex")}"` } })
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(offset ? [] : [...seen.values()]))
      })
      return
    }
    const obj = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname)
    if (obj && req.method === "GET") {
      const f = FILES[decodeURIComponent(obj[1])]?.[obj[2].split("/").map(decodeURIComponent).join("/")]
      if (!f) return res.writeHead(404).end()
      return res.writeHead(200, { "content-type": f.type }).end(f.body)
    }
    res.writeHead(404).end()
  })
}

let server: Server
let base = ""
beforeAll(async () => {
  server = fakeSupabase()
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const total = (b: string) => Object.keys(FILES[b]).length

async function suite(target: ObjectStore) {
  calls = []
  const source = new SupabaseRestSource(base, KEY)
  const dry = await copyStorage({ source, target, dryRun: true })
  expect(dry.attachments).toMatchObject({ objetos: 2, copiados: 2, iguales: 0, errores: [] })
  expect(await target.list({ bucket: "attachments", prefix: BOOK })).toEqual([])
  expect(dry["otro-bucket"]).toBeUndefined() // sin destino en Mirai: se salta

  const first = await copyStorage({ source, target })
  for (const b of ["attachments", "backups", "avatars"]) expect(first[b], b).toMatchObject({ objetos: total(b), copiados: total(b), errores: [] })
  // Las rutas lógicas no cambian.
  for (const [k, f] of Object.entries(FILES.attachments)) expect((await target.read({ bucket: "attachments", key: k }))?.equals(f.body)).toBe(true)
  expect(await target.head({ bucket: "attachments", key: `${BOOK}/gasto.png` })).toMatchObject({ contentType: "image/png" })

  const downloads = calls.filter((c) => c.startsWith("GET /storage/v1/object/")).length
  const second = await copyStorage({ source, target })
  for (const b of ["attachments", "backups", "avatars"]) expect(second[b], b).toMatchObject({ copiados: 0, iguales: total(b), md5: first[b].md5 })
  // Lo que ya está igual ni siquiera se descarga otra vez (tamaño + MD5 del eTag).
  expect(calls.filter((c) => c.startsWith("GET /storage/v1/object/")).length).toBe(downloads)
}

describe("storage-copy (Supabase Storage simulado → ObjectStore)", () => {
  it("destino en memoria: copia, rutas iguales, idempotente y simulación", async () => {
    await suite(new MemoryObjectStore())
  })

  it.skipIf(!process.env.FILES_TEST_S3_ENDPOINT)("destino MinIO (S3): igual, comparando con el eTag del destino", async () => {
    process.env.AWS_ACCESS_KEY_ID = "miraitest"
    process.env.AWS_SECRET_ACCESS_KEY = "miraitest-secret"
    const run = randomUUID().slice(0, 8)
    const store = await createObjectStore(loadFilesConfig({ OBJECT_STORE: "s3", S3_ENDPOINT: process.env.FILES_TEST_S3_ENDPOINT, S3_REGION: "us-east-1", S3_FORCE_PATH_STYLE: "1", STORAGE_BUCKET_PRIVATE: `cp-${run}-private`, STORAGE_BUCKET_BACKUPS: `cp-${run}-backups`, STORAGE_BUCKET_PUBLIC: `cp-${run}-public` }))
    await (store as unknown as { ensureBuckets: () => Promise<void> }).ensureBuckets()
    try {
      await suite(store)
    } finally {
      delete process.env.AWS_ACCESS_KEY_ID
      delete process.env.AWS_SECRET_ACCESS_KEY
    }
  })

  it("la línea de comandos no corre contra *.supabase.co sin --permitir-supabase ni con destino supabase", async () => {
    const env = { SUPABASE_URL: "https://abcdefgh.supabase.co", SUPABASE_SECRET_KEY: KEY, OBJECT_STORE: "memory" }
    expect(await main([], env)).toBe(2)
    expect(await main([], { ...env, SUPABASE_URL: base, OBJECT_STORE: "supabase" })).toBe(2)
    expect(await main(["--bucket=nada"], { ...env, SUPABASE_URL: base })).toBe(2)
    expect(await main([], { SUPABASE_URL: base })).toBe(2)
  })
})
