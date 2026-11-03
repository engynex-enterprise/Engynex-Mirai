// Adaptador para Cloud SQL (fase 4): las mismas consultas con Kysely dentro de tx().
import { Injectable } from "@nestjs/common"
import { sql } from "kysely"
import type { ChallengeIn } from "@mirai/domain/challenges"
import type { DbScope, SystemScope } from "../../../core/db/scope"
import { PgKyselyFactory } from "../../../core/db/pg-kysely.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { GamiRepo, type GamiState, type ReferidosRows } from "../gami.repository"

@Injectable()
export class PgKyselyGamiRepo extends GamiRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  state(scope: DbScope, { bookId, userId }: { bookId: string; userId: string }): Promise<GamiState> {
    return this.db.tx(scope, async (trx) => {
      const n = sql<number>`count(*)::int`.as("n")
      const [v, b, m, st, cfg, ch, cons, ret, fondo, prof] = await Promise.all([
        trx.selectFrom("gami_visits").select("dia").where("book_id", "=", bookId).where("user_id", "=", userId).orderBy("dia", "desc").limit(400).execute(),
        trx.selectFrom("gami_badges").select(["badge", "unlocked_at"]).where("book_id", "=", bookId).execute(),
        trx.selectFrom("gami_missions").select(["semana", "mision"]).where("book_id", "=", bookId).orderBy("semana", "desc").execute(),
        trx.selectFrom("gami_state").select(["max_level", "init_date"]).where("book_id", "=", bookId).executeTakeFirst(),
        trx.selectFrom("book_settings").select("gami").where("book_id", "=", bookId).executeTakeFirst(),
        trx.selectFrom("chat_threads").select(n).where("book_id", "=", bookId).executeTakeFirstOrThrow(),
        trx.selectFrom("advisor_consultations").select(n).where("book_id", "=", bookId).where("deleted_at", "is", null).executeTakeFirstOrThrow(),
        trx.selectFrom("savings_challenges").select(["tipo", "category_id", "dias", "base", "inicio", "marcas"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("emergency_funds").select(["activo", "saldo"]).where("book_id", "=", bookId).executeTakeFirst(),
        trx.selectFrom("profiles").select("nombre").where("id", "=", userId).executeTakeFirst(),
      ])
      const weeks = [...new Set(m.map((x) => x.semana))].slice(0, 12)
      const mis: Record<string, string[]> = {}
      for (const x of m) if (weeks.includes(x.semana)) (mis[x.semana] ??= []).push(x.mision)
      return {
        on: cfg?.gami !== false,
        visitas: v.map((x) => x.dia),
        unl: Object.fromEntries(b.map((x) => [x.badge, x.unlocked_at])),
        mis, maxLevel: st?.max_level ?? 1, init: st?.init_date ?? null,
        chats: ch.n, consejos: cons.n,
        retos: ret.map((r) => ({ ...r, base: Number(r.base ?? 0), marcas: (r.marcas ?? []) as number[] })) as unknown as ChallengeIn[],
        fondo: fondo ? { on: fondo.activo, saldo: Number(fondo.saldo) } : null,
        nombre: prof?.nombre ?? "",
      }
    })
  }

  referidos(scope: SystemScope, userId: string): Promise<ReferidosRows> {
    return this.db.tx(scope, async (trx) => {
      const [code, refs, cfg] = await Promise.all([
        trx.selectFrom("referral_codes").select("codigo").where("user_id", "=", userId).executeTakeFirst(),
        trx.selectFrom("referrals").select(["id", "referred", "estado", "created_at"]).where("referrer", "=", userId).orderBy("created_at", "desc").execute(),
        trx.selectFrom("platform_settings").select(["referidos_activo", "referidos_plan", "referidos_dias"]).executeTakeFirst(),
      ])
      const ids = refs.map((r) => r.referred)
      const [profs, plan] = await Promise.all([
        ids.length ? trx.selectFrom("profiles").select(["id", "nombre"]).where("id", "in", ids).execute() : Promise.resolve([]),
        trx.selectFrom("plans").select("nombre").where("id", "=", cfg?.referidos_plan ?? "premium").executeTakeFirst(),
      ])
      return { codigo: code?.codigo ?? null, invitados: refs, nombres: Object.fromEntries(profs.map((p) => [p.id, p.nombre ?? ""])), cfg: cfg ?? null, plan: plan?.nombre ?? null }
    })
  }

  async crearCodigo(scope: SystemScope, userId: string, codigo: string): Promise<boolean> {
    try {
      // KyselyDb usa las filas (Row) de Supabase: el insert va en SQL para no exigir las columnas con valor por defecto.
      await this.db.tx(scope, (trx) => sql`insert into referral_codes (user_id, codigo) values (${userId}, ${codigo})`.execute(trx))
      return true
    } catch (e) {
      if (e instanceof DomainError && e.code === "CONFLICT") return false
      throw e
    }
  }
}
