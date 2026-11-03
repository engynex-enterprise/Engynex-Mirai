// Adaptador de hoy (PostgREST). state(): las 10 consultas de useGamiState con el JWT de la persona. referidos(): las de
// misReferidos con la clave del sistema (la web usa supabaseAdmin: lee nombres de otras personas y platform_settings).
import { Injectable } from "@nestjs/common"
import type { ChallengeIn } from "@mirai/domain/challenges"
import type { DbScope, SystemScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { GamiRepo, type GamiState, type ReferidosRows } from "../gami.repository"

type Err = { code?: string; message?: string } | null
const check = <T extends { error: Err }>(r: T): T => {
  if (r.error) throw DomainError.fromPg(r.error)
  return r
}

@Injectable()
export class SupabaseJsGamiRepo extends GamiRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async state(scope: DbScope, { bookId, userId }: { bookId: string; userId: string }): Promise<GamiState> {
    const sb = this.sb.for(scope)
    const [v, b, m, st, cfg, ch, cons, ret, fondo, prof] = await Promise.all([
      sb.from("gami_visits").select("dia").eq("book_id", bookId).eq("user_id", userId).order("dia", { ascending: false }).limit(400),
      sb.from("gami_badges").select("badge,unlocked_at").eq("book_id", bookId),
      sb.from("gami_missions").select("semana,mision").eq("book_id", bookId).order("semana", { ascending: false }),
      sb.from("gami_state").select("max_level,init_date").eq("book_id", bookId).maybeSingle(),
      sb.from("book_settings").select("gami").eq("book_id", bookId).maybeSingle(),
      sb.from("chat_threads").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      sb.from("advisor_consultations").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null),
      sb.from("savings_challenges").select("tipo,category_id,dias,base,inicio,marcas").eq("book_id", bookId).is("deleted_at", null),
      sb.from("emergency_funds").select("activo,saldo").eq("book_id", bookId).maybeSingle(),
      sb.from("profiles").select("nombre").eq("id", userId).maybeSingle(),
    ])
    for (const r of [v, b, m, st, cfg, ch, cons, ret, fondo, prof]) check(r)
    const weeks = [...new Set((m.data ?? []).map((x) => x.semana))].slice(0, 12)
    const mis: Record<string, string[]> = {}
    for (const x of m.data ?? []) if (weeks.includes(x.semana)) (mis[x.semana] ??= []).push(x.mision)
    return {
      on: cfg.data?.gami !== false,
      visitas: (v.data ?? []).map((x) => x.dia),
      unl: Object.fromEntries((b.data ?? []).map((x) => [x.badge, x.unlocked_at])),
      mis, maxLevel: st.data?.max_level ?? 1, init: st.data?.init_date ?? null,
      chats: ch.count ?? 0, consejos: cons.count ?? 0,
      retos: (ret.data ?? []).map((r) => ({ ...r, base: Number(r.base ?? 0), marcas: (r.marcas ?? []) as number[] })) as unknown as ChallengeIn[],
      fondo: fondo.data ? { on: fondo.data.activo, saldo: Number(fondo.data.saldo) } : null,
      nombre: prof.data?.nombre ?? "",
    }
  }

  async referidos(scope: SystemScope, userId: string): Promise<ReferidosRows> {
    const db = this.sb.for(scope)
    const [code, refs, cfg] = await Promise.all([
      db.from("referral_codes").select("codigo").eq("user_id", userId).maybeSingle(),
      db.from("referrals").select("id,referred,estado,created_at").eq("referrer", userId).order("created_at", { ascending: false }),
      db.from("platform_settings").select("referidos_activo,referidos_plan,referidos_dias").maybeSingle(),
    ])
    for (const r of [code, refs, cfg]) check(r)
    const ids = (refs.data ?? []).map((r) => r.referred)
    const [profs, plan] = await Promise.all([
      ids.length ? db.from("profiles").select("id,nombre").in("id", ids) : Promise.resolve({ data: [] as { id: string; nombre: string | null }[], error: null }),
      db.from("plans").select("nombre").eq("id", cfg.data?.referidos_plan ?? "premium").maybeSingle(),
    ])
    check(profs)
    check(plan)
    return {
      codigo: code.data?.codigo ?? null,
      invitados: refs.data ?? [],
      nombres: Object.fromEntries((profs.data ?? []).map((p) => [p.id, p.nombre ?? ""])),
      cfg: cfg.data,
      plan: plan.data?.nombre ?? null,
    }
  }

  async crearCodigo(scope: SystemScope, userId: string, codigo: string): Promise<boolean> {
    const { error } = await this.sb.for(scope).from("referral_codes").insert({ user_id: userId, codigo })
    if (!error) return true
    if (error.code === "23505") return false
    throw DomainError.fromPg(error)
  }
}
