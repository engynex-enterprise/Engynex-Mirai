// ObjectStore sobre Azure Blob Storage (OBJECT_STORE=azure-blob). En la nube: identidad administrada
// (DefaultAzureCredential, adapters/azure/identity.ts) y SAS de delegación de usuario (sin llaves de la cuenta); necesita
// el rol «Storage Blob Data Contributor» (y «Storage Blob Delegator») en cada cuenta. En local: Azurite con
// AZURE_STORAGE_CONNECTION_STRING (SAS con la llave compartida del emulador).
// Terraform crea una cuenta por bucket físico (private / backups / public) con el contenedor `objetos`; con una
// cadena de conexión (una sola cuenta) cada bucket físico es un contenedor `<contenedor>-<físico>`.
// Azure no limita el tamaño en la SAS: complete() revisa tamaño y tipo y borra lo que no cumpla.
import type { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, UserDelegationKey } from "@azure/storage-blob"
import type { PhysicalBucket, StoreBucket } from "../../core/files/buckets"
import { PHYSICAL } from "../../core/files/buckets"
import { contentDisposition, folderPrefix, keyOf, objectName, ObjectStore, type ObjectEntry, type ObjectInfo, type SignDownloadArgs, type SignedUpload, type SignUploadArgs, type WriteArgs } from "../../core/files/object-store"
import { azureCredential } from "./identity"

type BlobSdk = typeof import("@azure/storage-blob")

export type AzureStoreOptions = {
  /** Cuenta por bucket físico (identidad administrada). */
  accounts: Record<PhysicalBucket, string>
  container: string
  /** Solo Azurite/desarrollo: una cuenta con llave compartida. */
  connectionString?: string
  /** Plantilla del endpoint: https://{account}.blob.core.windows.net (otra nube soberana o Azurite). */
  endpoint: string
  publicBaseUrl?: string
}

type Target = { service: BlobServiceClient; container: ContainerClient; account: string; shared?: StorageSharedKeyCredential }

const notFound = (e: unknown) => (e as { statusCode?: number })?.statusCode === 404

export class AzureBlobObjectStore extends ObjectStore {
  override readonly driver: string = "azure-blob"
  private delegation = new Map<string, { key: UserDelegationKey; exp: number }>()

  constructor(
    private readonly o: AzureStoreOptions,
    private readonly sdk: BlobSdk,
    private readonly targets: Record<PhysicalBucket, Target>,
  ) {
    super()
  }

  private t(b: StoreBucket) {
    return this.targets[PHYSICAL[b]]
  }
  private blob(b: StoreBucket, key: string) {
    return this.t(b).container.getBlockBlobClient(objectName(b, key))
  }

  /** SAS de un blob: llave compartida (Azurite) o delegación de usuario (identidad administrada), cacheada ~1 h. */
  private async sas(b: StoreBucket, key: string, perms: string, ttlS: number, extra: { contentType?: string; contentDisposition?: string } = {}) {
    const t = this.t(b)
    const startsOn = new Date(Date.now() - 5 * 60_000)
    const expiresOn = new Date(Date.now() + ttlS * 1000)
    const values = { containerName: t.container.containerName, blobName: objectName(b, key), permissions: this.sdk.BlobSASPermissions.parse(perms), startsOn, expiresOn, protocol: t.shared ? undefined : this.sdk.SASProtocol.Https, ...extra }
    if (t.shared) return this.sdk.generateBlobSASQueryParameters(values, t.shared).toString()
    let d = this.delegation.get(t.account)
    if (!d || d.exp < expiresOn.getTime() + 60_000) {
      const exp = Date.now() + 2 * 3600_000
      const key = await t.service.getUserDelegationKey(startsOn, new Date(exp))
      d = { key, exp }
      this.delegation.set(t.account, d)
    }
    return this.sdk.generateBlobSASQueryParameters(values, d.key, t.account).toString()
  }

  async signUpload(a: SignUploadArgs): Promise<SignedUpload> {
    const q = await this.sas(a.bucket, a.key, "cw", a.ttlS)
    return { url: `${this.blob(a.bucket, a.key).url}?${q}`, headers: { "content-type": a.contentType, "x-ms-blob-type": "BlockBlob" }, expiresAt: new Date(Date.now() + a.ttlS * 1000).toISOString() }
  }

  async signDownload(a: SignDownloadArgs): Promise<string> {
    const q = await this.sas(a.bucket, a.key, "r", a.ttlS, a.download ? { contentDisposition: contentDisposition(a.filename, a.key) } : {})
    return `${this.blob(a.bucket, a.key).url}?${q}`
  }

  async head(a: { bucket: StoreBucket; key: string }): Promise<ObjectInfo | null> {
    try {
      const p = await this.blob(a.bucket, a.key).getProperties()
      return { size: Number(p.contentLength ?? 0), contentType: p.contentType ?? null, md5: p.contentMD5 ? Buffer.from(p.contentMD5).toString("base64") : null, etag: p.etag?.replace(/"/g, "") ?? null, updated: p.lastModified?.toISOString() ?? null }
    } catch (e) {
      if (notFound(e)) return null
      throw e
    }
  }

  async read(a: { bucket: StoreBucket; key: string; range?: [number, number] }): Promise<Buffer | null> {
    try {
      return a.range ? await this.blob(a.bucket, a.key).downloadToBuffer(a.range[0], a.range[1] - a.range[0] + 1) : await this.blob(a.bucket, a.key).downloadToBuffer()
    } catch (e) {
      if (notFound(e)) return null
      throw e
    }
  }

  async write(a: WriteArgs): Promise<void> {
    const body = Buffer.from(a.body)
    await this.blob(a.bucket, a.key).uploadData(body, { blobHTTPHeaders: { blobContentType: a.contentType, ...(a.cacheControl ? { blobCacheControl: a.cacheControl } : {}) } })
  }

  async list(a: { bucket: StoreBucket; prefix: string; limit?: number }): Promise<ObjectEntry[]> {
    const out: ObjectEntry[] = []
    for await (const it of this.t(a.bucket).container.listBlobsFlat({ prefix: `${a.bucket}/${folderPrefix(a.prefix)}` })) {
      const key = keyOf(a.bucket, it.name)
      if (key) out.push({ key, size: Number(it.properties.contentLength ?? 0), contentType: it.properties.contentType ?? null, md5: it.properties.contentMD5 ? Buffer.from(it.properties.contentMD5).toString("base64") : null, updated: it.properties.lastModified?.toISOString() ?? null })
      if (a.limit && out.length >= a.limit) break
    }
    return out
  }

  async remove(bucket: StoreBucket, keys: string[]): Promise<number> {
    let n = 0
    for (let i = 0; i < keys.length; i += 10) {
      const r = await Promise.all(keys.slice(i, i + 10).map((k) => this.blob(bucket, k).deleteIfExists().then((x) => (x.succeeded ? 1 : 0))))
      n += r.reduce<number>((s, x) => s + x, 0)
    }
    return n
  }

  /** Solo desarrollo y pruebas (Azurite): crea los contenedores si no existen. En la nube los crea Terraform. */
  async ensureBuckets(): Promise<void> {
    for (const t of Object.values(this.targets)) await t.container.createIfNotExists()
  }

  publicUrl(bucket: StoreBucket, key: string): string {
    if (this.o.publicBaseUrl) return `${this.o.publicBaseUrl}/${objectName(bucket, key).split("/").map(encodeURIComponent).join("/")}`
    return this.blob(bucket, key).url
  }
}

/** Crea el adaptador cargando @azure/storage-blob (y @azure/identity si no hay cadena de conexión) solo ahora. */
export async function createAzureBlobObjectStore(o: AzureStoreOptions): Promise<AzureBlobObjectStore> {
  const sdk = await import("@azure/storage-blob")
  const targets = {} as Record<PhysicalBucket, Target>
  if (o.connectionString) {
    const service = sdk.BlobServiceClient.fromConnectionString(o.connectionString)
    const shared = service.credential instanceof sdk.StorageSharedKeyCredential ? service.credential : undefined
    for (const p of ["private", "backups", "public"] as const) {
      const name = o.accounts[p] && /^[a-z0-9-]{3,63}$/.test(o.accounts[p]) ? o.accounts[p] : `${o.container}-${p}`
      targets[p] = { service, container: service.getContainerClient(name), account: service.accountName, shared }
    }
  } else {
    const credential = await azureCredential()
    for (const p of ["private", "backups", "public"] as const) {
      const service = new sdk.BlobServiceClient(o.endpoint.replace("{account}", o.accounts[p]), credential)
      targets[p] = { service, container: service.getContainerClient(o.container), account: o.accounts[p] }
    }
  }
  return new AzureBlobObjectStore(o, sdk, targets)
}
