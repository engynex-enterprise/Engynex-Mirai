// Revisión de "lista para tráfico" (/readyz, §2.7.9): base (HEAD a PostgREST o select 1 con pg), JWKS y ENCRYPTION_KEY.
// Guarda el resultado 5 s para no golpear la base si Cloud Run o un balanceador lo consultan seguido.
import { Injectable } from "@nestjs/common"
import type { Readiness } from "@mirai/contracts/modules/health"
import { TokenVerifier } from "../auth/token-verifier"
import { CryptoService } from "../crypto/crypto.service"
import { DbHealth } from "../db/db-health"

async function timed(fn: () => Promise<{ ok: boolean; msg?: string }>, timeoutMs = 5000) {
  const t = Date.now()
  try {
    const r = await Promise.race([fn(), new Promise<{ ok: boolean; msg: string }>((res) => setTimeout(() => res({ ok: false, msg: "Tiempo de espera agotado" }), timeoutMs).unref())])
    return { ...r, ms: Date.now() - t }
  } catch (e) {
    return { ok: false, ms: Date.now() - t, msg: (e as Error).name }
  }
}

@Injectable()
export class ReadinessService {
  private last?: { at: number; r: Promise<Readiness> }
  constructor(
    private readonly db: DbHealth,
    private readonly verifier: TokenVerifier,
    private readonly crypto: CryptoService,
  ) {}
  check(now = Date.now()): Promise<Readiness> {
    if (this.last && now - this.last.at < 5000) return this.last.r
    const r = (async () => {
      const [db, jwks] = await Promise.all([timed(() => this.db.check()), timed(() => this.verifier.ready())])
      const encryption = this.crypto.ready ? { ok: true } : { ok: false, msg: "Falta ENCRYPTION_KEY" }
      const checks = { db, jwks, encryption }
      return { ok: Object.values(checks).every((c) => c.ok), checks }
    })()
    this.last = { at: now, r }
    return r
  }
}
