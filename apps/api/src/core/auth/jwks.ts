// Llaves públicas (JWKS) con caché que nunca bloquea a la persona:
// - la primera vez se descargan (al arrancar, con reintentos);
// - después se usan las que hay y, si pasaron `refreshMs`, se refrescan EN SEGUNDO PLANO (stale-while-revalidate);
// - si llega un token con un `kid` desconocido (rotación de llaves), se recarga ya (con enfriamiento) y se reintenta.
// Con createRemoteJWKSet de jose, cada `cacheMaxAge` una petición esperaba la recarga, y el JWKS de Supabase a veces
// tarda varios segundos en responder: esa petición fallaba con 502.
import { createLocalJWKSet, errors, type JSONWebKeySet, type JWTVerifyGetKey } from "jose"

export interface JwksSource {
  getKey: JWTVerifyGetKey
  /** Descarga (o espera la descarga en curso). Lanza si falla. */
  reload(): Promise<void>
  /** ¿Ya hay llaves? */
  readonly loaded: boolean
}

/** JWKS fijo (pruebas o llaves locales). */
export const staticJwks = (getKey: JWTVerifyGetKey): JwksSource => ({ getKey, reload: async () => {}, loaded: true })

export type RemoteJwksOptions = { refreshMs?: number; timeoutMs?: number; cooldownMs?: number; fetch?: typeof fetch; now?: () => number }

export class CachedRemoteJwks implements JwksSource {
  private local?: ReturnType<typeof createLocalJWKSet>
  private loadedAt = 0
  private pending?: Promise<void>
  private readonly refreshMs: number
  private readonly timeoutMs: number
  private readonly cooldownMs: number
  private readonly f: typeof fetch
  private readonly now: () => number

  constructor(private readonly url: URL, o: RemoteJwksOptions = {}) {
    this.refreshMs = o.refreshMs ?? 10 * 60_000
    this.timeoutMs = o.timeoutMs ?? 10_000
    this.cooldownMs = o.cooldownMs ?? 30_000
    this.f = o.fetch ?? fetch
    this.now = o.now ?? Date.now
  }

  get loaded() {
    return !!this.local
  }

  reload(): Promise<void> {
    this.pending ??= (async () => {
      const r = await this.f(this.url, { headers: { accept: "application/json, application/jwk-set+json" }, signal: AbortSignal.timeout(this.timeoutMs) })
      if (!r.ok) throw new errors.JOSEError(`JWKS respondió ${r.status}`)
      const json = (await r.json()) as JSONWebKeySet
      if (!json || !Array.isArray(json.keys)) throw new errors.JOSEError("JWKS inválido")
      this.local = createLocalJWKSet(json)
      this.loadedAt = this.now()
    })().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  getKey: JWTVerifyGetKey = async (header, token) => {
    if (!this.local) await this.reload()
    else if (this.now() - this.loadedAt > this.refreshMs) void this.reload().catch(() => undefined)
    try {
      return await this.local!(header, token)
    } catch (e) {
      if (e instanceof errors.JWKSNoMatchingKey && this.now() - this.loadedAt > this.cooldownMs) {
        await this.reload()
        return this.local!(header, token)
      }
      throw e
    }
  }
}
