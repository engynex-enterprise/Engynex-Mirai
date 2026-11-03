// v7 · V7-J · Copia los archivos de Supabase Storage a los buckets de la nube destino (§3.4), por la API de Storage.
//
//   SUPABASE_SERVICE_KEY=… S3_ACCESS_KEY=… S3_SECRET_KEY=… node --experimental-strip-types scripts/migrate/storage-copy.ts \
//     --supabase <https://<ref>.supabase.co | http://localhost:55421> --s3 <endpoint> \
//     --private <bucket> --backups <bucket> --public <bucket> [--prefix ensayo/] [--dry-run] [--permitir-supabase] [--allow-remote]
//
// Las rutas lógicas NO cambian: el bucket de Supabase queda como prefijo (attachments/{book_id}/… → <private>/attachments/…).
//   attachments, logos, feedback → --private · backups → --backups · avatars, ads, public-assets → --public
// Destino por la API S3 (AWS S3, MinIO local, R2 o la interoperabilidad de GCS); el adaptador `gcs` con ADC del puerto
// ObjectStore (V7-E) queda para cuando ese puerto esté listo. Idempotente: salta lo que ya está con el mismo MD5
// (metadato `md5`). Reporte: conteo y MD5 por bucket, y falla si algo quedó distinto.
import { createHash } from "node:crypto"
import { flag, hostOf, log, opt, requireApi } from "./lib.ts"

type Entry = { name: string; id: string | null; metadata?: { size?: number; mimetype?: string } | null }
const MAP: Record<string, "private" | "backups" | "public"> = { attachments: "private", logos: "private", feedback: "private", backups: "backups", avatars: "public", ads: "public", "public-assets": "public" }

export type CopyReport = Record<string, { objetos: number; copiados: number; iguales: number; bytes: number; distintos: string[] }>

export async function storageCopy(o: {
  supabaseUrl: string
  serviceKey: string
  s3: { endpoint: string; accessKeyId: string; secretAccessKey: string; region?: string }
  targets: { private: string; backups: string; public: string }
  prefix?: string
  dryRun?: boolean
}): Promise<CopyReport> {
  const { S3Client, PutObjectCommand, HeadObjectCommand } = (await import(requireApi.resolve("@aws-sdk/client-s3"))) as typeof import("@aws-sdk/client-s3")
  const s3 = new S3Client({ endpoint: o.s3.endpoint, region: o.s3.region ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: o.s3.accessKeyId, secretAccessKey: o.s3.secretAccessKey } })
  const base = `${o.supabaseUrl.replace(/\/+$/, "")}/storage/v1`
  const h = { Authorization: `Bearer ${o.serviceKey}`, apikey: o.serviceKey }
  const rep: CopyReport = {}

  async function list(bucket: string, prefix: string): Promise<string[]> {
    const out: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const r = await fetch(`${base}/object/list/${bucket}`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) })
      if (!r.ok) throw new Error(`No se pudo listar ${bucket}/${prefix} (${r.status})`)
      const page = (await r.json()) as Entry[]
      for (const e of page) {
        const path = prefix ? `${prefix}/${e.name}` : e.name
        if (e.id === null) out.push(...(await list(bucket, path)))
        else out.push(path)
      }
      if (page.length < 1000) return out
    }
  }

  const buckets = ((await (await fetch(`${base}/bucket`, { headers: h })).json()) as { id: string }[]).map((b) => b.id)
  for (const bucket of buckets) {
    const kind = MAP[bucket]
    if (!kind) {
      log(`! bucket ${bucket} sin destino definido: se salta`)
      continue
    }
    const r = (rep[bucket] = { objetos: 0, copiados: 0, iguales: 0, bytes: 0, distintos: [] as string[] })
    const start = (o.prefix ?? "").replace(/\/+$/, "")
    for (const path of await list(bucket, start)) {
      r.objetos++
      const res = await fetch(`${base}/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: h })
      if (!res.ok) {
        r.distintos.push(`${path} (no se pudo leer: ${res.status})`)
        continue
      }
      const body = Buffer.from(await res.arrayBuffer())
      const md5 = createHash("md5").update(body).digest("hex")
      r.bytes += body.length
      const Bucket = o.targets[kind]
      const Key = `${bucket}/${path}`
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key })).catch(() => null)
      if (head?.Metadata?.md5 === md5) {
        r.iguales++
        continue
      }
      if (!o.dryRun) {
        await s3.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: res.headers.get("content-type") ?? "application/octet-stream", Metadata: { md5 } }))
        const check = await s3.send(new HeadObjectCommand({ Bucket, Key }))
        if (check.Metadata?.md5 !== md5 || Number(check.ContentLength) !== body.length) r.distintos.push(Key)
      }
      r.copiados++
    }
  }
  return rep
}

async function main() {
  const supabaseUrl = opt("--supabase")
  const endpoint = opt("--s3")
  if (!supabaseUrl || !endpoint) throw new Error("Faltan --supabase <url> y --s3 <endpoint>")
  const sh = hostOf(supabaseUrl)
  if (/supabase\.(co|com)$/.test(sh) && !flag("--permitir-supabase")) throw new Error("El origen es Supabase: solo con --permitir-supabase (permiso del dueño).")
  if (!/supabase\.(co|com)$/.test(sh) && !["localhost", "127.0.0.1"].includes(sh) && !flag("--allow-remote")) throw new Error(`Origen ${sh} no local: agrega --allow-remote`)
  if (!["localhost", "127.0.0.1"].includes(hostOf(endpoint)) && !flag("--allow-remote")) throw new Error("El destino S3 no es local: agrega --allow-remote")
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const accessKeyId = process.env.S3_ACCESS_KEY
  const secretAccessKey = process.env.S3_SECRET_KEY
  if (!serviceKey || !accessKeyId || !secretAccessKey) throw new Error("Faltan SUPABASE_SERVICE_KEY, S3_ACCESS_KEY o S3_SECRET_KEY en el entorno")
  const targets = { private: opt("--private") ?? "", backups: opt("--backups") ?? "", public: opt("--public") ?? "" }
  if (!targets.private || !targets.backups || !targets.public) throw new Error("Faltan --private, --backups y --public")
  const rep = await storageCopy({ supabaseUrl, serviceKey, s3: { endpoint, accessKeyId, secretAccessKey }, targets, prefix: opt("--prefix"), dryRun: flag("--dry-run") })
  log(JSON.stringify(rep))
  if (Object.values(rep).some((r) => r.distintos.length)) process.exitCode = 2
}

if (process.argv[1]?.endsWith("storage-copy.ts")) await main()
