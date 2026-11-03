// V7-E · Copia los objetos de Supabase Storage al almacenamiento destino por el puerto ObjectStore (gcs con ADC,
// s3 o azure-blob: el mismo adaptador que usará la API, así las rutas quedan exactamente donde la API las busca).
// Lee la fuente por la API REST de Storage con la clave secreta (lista recursiva + descarga); no necesita llaves S3 de
// Supabase ni rclone. Idempotente: salta lo que ya está con el mismo tamaño y MD5 (eTag de Supabase vs. md5/etag del
// destino), así la pasada final de la ventana B solo copia diferencias. Nunca imprime secretos.
//
//   pnpm --filter api build && \
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=… \
//   OBJECT_STORE=gcs STORAGE_BUCKET_PRIVATE=… STORAGE_BUCKET_BACKUPS=… STORAGE_BUCKET_PUBLIC=… \
//   node apps/api/dist/storage-copy.js [--dry-run] [--bucket=attachments,avatars] [--prefix=<carpeta>] [--permitir-supabase]
//
// Contra un proyecto real de Supabase (*.supabase.co) exige --permitir-supabase (protección contra corridas por error).
// Sale con código 1 si algún objeto quedó distinto o no se pudo leer. scripts/migrate/storage-copy.ts (V7-J) es la
// variante sin compilar con destino S3; esta sirve para cualquier nube.
import { createHash } from "node:crypto"
import { isStoreBucket, STORE_BUCKETS, type StoreBucket } from "../core/files/buckets"
import { loadFilesConfig } from "../core/files/files.config"
import type { ObjectStore } from "../core/files/object-store"
import { createObjectStore } from "../core/files/object-store.module"

export type SourceObject = { key: string; size: number; contentType: string | null; etag: string | null }

/** De dónde se copia (Supabase Storage por REST; en las pruebas, un doble). */
export interface StorageSource {
  buckets(): Promise<string[]>
  list(bucket: string, prefix: string): Promise<SourceObject[]>
  download(bucket: string, key: string): Promise<{ body: Buffer; contentType: string | null }>
}

type Entry = { name: string; id: string | null; metadata?: { size?: number; mimetype?: string; eTag?: string } | null }

/** Supabase Storage por su API REST con la clave secreta (solo lectura: list, bucket y descarga). */
export class SupabaseRestSource implements StorageSource {
  private readonly base: string
  constructor(
    url: string,
    private readonly key: string,
    private readonly f: typeof fetch = fetch,
  ) {
    this.base = `${url.replace(/\/+$/, "")}/storage/v1`
  }
  private get h() {
    return { authorization: `Bearer ${this.key}`, apikey: this.key }
  }
  async buckets() {
    const r = await this.f(`${this.base}/bucket`, { headers: this.h })
    if (!r.ok) throw new Error(`No se pudieron listar los buckets (${r.status})`)
    return ((await r.json()) as { id: string }[]).map((b) => b.id)
  }
  async list(bucket: string, prefix: string, depth = 0): Promise<SourceObject[]> {
    if (depth > 8) return []
    const out: SourceObject[] = []
    for (let offset = 0; ; offset += 1000) {
      const r = await this.f(`${this.base}/object/list/${encodeURIComponent(bucket)}`, { method: "POST", headers: { ...this.h, "content-type": "application/json" }, body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) })
      if (!r.ok) throw new Error(`No se pudo listar ${bucket}/${prefix} (${r.status})`)
      const page = (await r.json()) as Entry[]
      for (const e of page) {
        const key = prefix ? `${prefix}/${e.name}` : e.name
        if (e.id === null && !e.metadata) out.push(...(await this.list(bucket, key, depth + 1)))
        else out.push({ key, size: Number(e.metadata?.size ?? 0), contentType: e.metadata?.mimetype ?? null, etag: e.metadata?.eTag?.replace(/"/g, "") ?? null })
      }
      if (page.length < 1000) return out
    }
  }
  async download(bucket: string, key: string) {
    const r = await this.f(`${this.base}/object/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, { headers: this.h })
    if (!r.ok) throw new Error(`no se pudo leer (${r.status})`)
    return { body: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") }
  }
}

export type BucketReport = { objetos: number; copiados: number; iguales: number; bytes: number; md5: string; errores: string[] }
export type CopyReport = Record<string, BucketReport>

const md5hex = (b: Buffer) => createHash("md5").update(b).digest("hex")
/** El MD5 del destino en hex: GCS/Azure lo dan en base64; S3/MinIO en el eTag (subida de una sola parte). */
const targetMd5 = (i: { md5?: string | null; etag?: string | null }) => (i.md5 ? Buffer.from(i.md5, "base64").toString("hex") : /^[0-9a-f]{32}$/i.test(i.etag ?? "") ? i.etag!.toLowerCase() : null)

/** Copia (o simula con dryRun). `md5` del reporte = MD5 de la lista ordenada "ruta:md5" del bucket, para comparar dos pasadas. */
export async function copyStorage(o: { source: StorageSource; target: ObjectStore; buckets?: string[]; prefix?: string; dryRun?: boolean; log?: (m: string) => void; concurrency?: number }): Promise<CopyReport> {
  const log = o.log ?? (() => undefined)
  const rep: CopyReport = {}
  const available = await o.source.buckets()
  const wanted = (o.buckets?.length ? o.buckets : available).filter((b) => available.includes(b))
  for (const bucket of wanted) {
    if (!isStoreBucket(bucket)) {
      log(`! bucket ${bucket} sin destino en Mirai: se salta`)
      continue
    }
    const b: StoreBucket = bucket
    const r: BucketReport = (rep[b] = { objetos: 0, copiados: 0, iguales: 0, bytes: 0, md5: "", errores: [] })
    const sums: string[] = []
    const items = await o.source.list(b, (o.prefix ?? "").replace(/^\/+|\/+$/g, ""))
    const work = async (it: SourceObject) => {
      r.objetos++
      r.bytes += it.size
      try {
        const head = await o.target.head({ bucket: b, key: it.key })
        const tmd5 = head ? targetMd5(head) : null
        if (head && head.size === it.size && it.etag && tmd5 === it.etag.toLowerCase()) {
          r.iguales++
          sums.push(`${it.key}:${tmd5}`)
          return
        }
        const { body, contentType } = await o.source.download(b, it.key)
        const sum = md5hex(body)
        if (head && head.size === body.length && tmd5 === sum) {
          r.iguales++
          sums.push(`${it.key}:${sum}`)
          return
        }
        if (!o.dryRun) {
          await o.target.write({ bucket: b, key: it.key, body, contentType: it.contentType ?? contentType ?? "application/octet-stream" })
          const check = await o.target.head({ bucket: b, key: it.key })
          const cmd5 = check ? targetMd5(check) : null
          if (!check || check.size !== body.length || (cmd5 && cmd5 !== sum)) r.errores.push(`${it.key} (quedó distinto en el destino)`)
        }
        r.copiados++
        sums.push(`${it.key}:${sum}`)
      } catch (e) {
        r.errores.push(`${it.key} (${(e as Error).message})`)
      }
    }
    const n = Math.max(1, o.concurrency ?? 8)
    for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(work))
    r.md5 = createHash("md5").update(sums.sort().join("\n")).digest("hex")
    log(`${b}: ${r.objetos} objetos · ${r.copiados} ${o.dryRun ? "por copiar" : "copiados"} · ${r.iguales} iguales · ${r.errores.length} con error · md5 ${r.md5}`)
  }
  return rep
}

/** Uso por línea de comandos (dist/storage-copy.js). */
export async function main(argv = process.argv.slice(2), env = process.env): Promise<number> {
  const flag = (n: string) => argv.includes(`--${n}`)
  const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    process.stderr.write("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (la fuente).\n")
    return 2
  }
  if (/\.supabase\.co\b/.test(new URL(url).hostname) && !flag("permitir-supabase")) {
    process.stderr.write("La fuente es un proyecto real de Supabase: confirma con --permitir-supabase (y prueba antes con --dry-run).\n")
    return 2
  }
  const cfg = loadFilesConfig(env)
  if (cfg.driver === "supabase") {
    process.stderr.write("OBJECT_STORE debe ser el destino (gcs, s3 o azure-blob), no supabase.\n")
    return 2
  }
  const buckets = opt("bucket")?.split(",").map((s) => s.trim()).filter(Boolean)
  for (const b of buckets ?? []) if (!isStoreBucket(b)) {
    process.stderr.write(`Bucket desconocido: ${b} (usa ${STORE_BUCKETS.join(", ")}).\n`)
    return 2
  }
  const target = await createObjectStore(cfg)
  const rep = await copyStorage({ source: new SupabaseRestSource(url, key), target, buckets, prefix: opt("prefix"), dryRun: flag("dry-run"), log: (m) => process.stdout.write(`${m}\n`) })
  process.stdout.write(`${JSON.stringify({ destino: cfg.driver, simulacion: flag("dry-run"), reporte: rep }, null, 2)}\n`)
  return Object.values(rep).some((r) => r.errores.length) ? 1 : 0
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`La copia falló: ${(e as Error).message}\n`)
      process.exit(1)
    },
  )
}
