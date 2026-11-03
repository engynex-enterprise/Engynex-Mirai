// Logros (F2-C-6): lo mismo que useGami de la web (puntos, nivel, racha, misiones e insignias) con @mirai/domain/gami
// sobre el libro completo de book-tables. Referidos: lo mismo que misReferidos. No conoce Supabase.
import { Injectable } from "@nestjs/common"
import type { GamiChecked, GamiView, LogroIn, Referidos } from "@mirai/contracts/modules/gami"
import { todayBogota } from "@mirai/domain/dates"
import { can } from "@mirai/domain/household/roles"
import { GBADGES, gamiPending, gamiXP, misionesSemana, nivel, puntuales, racha, rachaMax, type GamiInput } from "@mirai/domain/gami"
import { MAX_RECOMPENSAS, nuevoCodigo } from "@mirai/domain/referidos"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { RowStore } from "../../core/store/row-store"
import { BookTablesService } from "../book-tables/book-tables.service"
import { GamiRepo } from "./gami.repository"

/** Ruta para compartir el código (la web le antepone su dirección pública, siteUrl()). */
export const rutaReferido = (codigo: string) => `/registro?ref=${codigo}`

@Injectable()
export class GamiService {
  constructor(
    private readonly repo: GamiRepo,
    private readonly tables: BookTablesService,
    private readonly ctx: RequestContextService,
    private readonly rows: RowStore,
  ) {}

  /** Libro completo + estado guardado → la entrada de @mirai/domain/gami (lo mismo que useGami). */
  private async input(today: string) {
    const [book, st] = await Promise.all([this.tables.loadBook(today), this.repo.state(this.ctx.db, { bookId: this.ctx.book.book.id, userId: this.ctx.user.id })])
    const G: GamiInput = { book, perfilNombre: st.nombre, fondo: st.fondo, retos: st.retos, consejos: st.consejos, chats: st.chats, visitas: st.visitas, unl: st.unl, mis: st.mis }
    return { G, st }
  }

  async get(hoy?: string): Promise<GamiView> {
    const today = hoy ?? todayBogota()
    const { G, st } = await this.input(today)
    const xp = gamiXP(G, today)
    const pend = gamiPending(G, today)
    return {
      on: st.on,
      hoy: today,
      xp,
      nivel: nivel(xp.total),
      racha: racha(st.visitas, today),
      rachaMax: rachaMax(st.visitas),
      // Sin la función `prog` de cada misión (no viaja en JSON).
      misiones: misionesSemana(G, today).map(({ k, t, d, icon, xp: x, goal, p, ok, wk, fin }) => ({ k, t, d, icon, xp: x, goal, p, ok, wk, fin })),
      puntuales: puntuales(G.book, today),
      insignias: GBADGES.map(({ id, n, d, icon, tier }) => ({ id, n, d, icon, tier, unlocked_at: st.unl[id] ?? null })),
      pendientes: { badges: pend.badges.map((b) => b.id), missions: pend.missions.map((m) => m.k) },
      estado: { visitas: new Set(st.visitas).size, maxLevel: st.maxLevel, init: st.init, chats: st.chats, consejos: st.consejos },
    }
  }

  /** Visita del día (racha): upsert sin duplicar, con la sesión de la persona (la RLS exige que sea la suya). */
  async visit(hoy?: string): Promise<{ dia: string }> {
    const dia = hoy ?? todayBogota()
    await this.rows.upsert(this.ctx.db, "gami_visits", [{ book_id: this.ctx.book.book.id, user_id: this.ctx.user.id, dia }], { onConflict: ["book_id", "user_id", "dia"], ignoreDuplicates: true })
    return { dia }
  }

  /**
   * gamiCheck de la v4 (GamiCheck de la web) en el servidor: guarda las insignias y misiones cumplidas, el nivel máximo
   * (solo «Editar todo», como useCanEdit) y avisa en la campana; la primera evaluación del libro no celebra lo que ya
   * estaba cumplido. Con logros apagados (book_settings.gami = false) no escribe nada.
   */
  async check(hoy?: string): Promise<GamiChecked> {
    const today = hoy ?? todayBogota()
    const { G, st } = await this.input(today)
    const none: GamiChecked = { on: st.on, first: false, badges: [], missions: [], nivel: null }
    if (!st.on) return none
    const { badges, missions } = gamiPending(G, today)
    const L = nivel(gamiXP(G, today).total)
    const first = !st.init
    const subio = L.n > st.maxLevel
    if (!badges.length && !missions.length && !subio && !first) return none
    const bookId = this.ctx.book.book.id
    const db = this.ctx.db
    if (badges.length) await this.rows.upsert(db, "gami_badges", badges.map((b) => ({ book_id: bookId, badge: b.id, unlocked_at: today })), { onConflict: ["book_id", "badge"], ignoreDuplicates: true })
    if (!first && (badges.length || subio)) await this.logros({ badges: badges.map((b) => ({ id: b.id, n: b.n, d: b.d })), nivel: subio ? { n: L.n, name: L.name } : null })
    if (missions.length) await this.rows.upsert(db, "gami_missions", missions.map((m) => ({ book_id: bookId, semana: m.wk, mision: m.k })), { onConflict: ["book_id", "semana", "mision"], ignoreDuplicates: true })
    if (can(this.ctx.book.access, "editarTodo") && (first || subio))
      await this.rows.upsert(db, "gami_state", [{ book_id: bookId, max_level: Math.max(st.maxLevel, L.n), init_date: st.init ?? today }], { onConflict: ["book_id"] })
    if (first) return { on: true, first: true, badges: [], missions: [], nivel: null }
    return {
      on: true,
      first: false,
      badges: badges.map(({ id, n, d, icon, tier }) => ({ id, n, d, icon, tier })),
      missions: missions.map(({ k, t, xp, wk }) => ({ k, t, xp, wk })),
      nivel: subio ? { n: L.n, name: L.name } : null,
    }
  }

  /** logroNotifs: insignias y subida de nivel → campana (kind "logro"), una por insignia y nivel (dedupe). */
  async logros(d: LogroIn): Promise<{ saved: number }> {
    const userId = this.ctx.user.id
    const bookId = this.ctx.book.book.id
    const rows = [
      ...d.badges.map((b) => ({ user_id: userId, book_id: bookId, kind: "logro", titulo: `Insignia: ${b.n}`, cuerpo: b.d, href: "/logros", dedupe: `${bookId}:logro:${b.id}` })),
      ...(d.nivel ? [{ user_id: userId, book_id: bookId, kind: "logro", titulo: `¡Subiste al nivel ${d.nivel.n}!`, cuerpo: `Ahora eres ${d.nivel.name}. ¡Sigue así!`, href: "/logros", dedupe: `${bookId}:nivel:${d.nivel.n}` }] : []),
    ]
    if (!rows.length) return { saved: 0 }
    // La campana no tiene política de escritura para la persona: la web usa supabaseAdmin() (SystemScope con motivo).
    const saved = await this.rows.upsert(systemScope("logros: aviso de insignia o nivel en la campana"), "notifications", rows, { onConflict: ["user_id", "dedupe"], ignoreDuplicates: true })
    return { saved: saved.length }
  }

  /** misReferidos: tu código (lo crea la primera vez), ajustes del programa y a quiénes invitaste (solo primer nombre). */
  async referidos(): Promise<Referidos> {
    const userId = this.ctx.user.id
    const sys = systemScope("referidos: código propio, ajustes del programa y primer nombre de los invitados")
    const r = await this.repo.referidos(sys, userId)
    const codigo = r.codigo ?? (await this.crearCodigo(userId))
    return {
      codigo, ruta: rutaReferido(codigo), activo: r.cfg?.referidos_activo ?? true, dias: r.cfg?.referidos_dias ?? 30, plan: r.plan ?? "Premium", max: MAX_RECOMPENSAS,
      invitados: r.invitados.map((x) => ({ id: x.id, nombre: r.nombres[x.referred]?.split(" ")[0] || "Alguien", estado: x.estado, fecha: x.created_at })),
    }
  }

  /** codigoDe de apps/web/lib/referidos.ts: hasta 5 intentos si el código ya existe. */
  private async crearCodigo(userId: string): Promise<string> {
    const sys = systemScope("referidos: crear el código de la persona")
    for (let i = 0; i < 5; i++) {
      const codigo = nuevoCodigo()
      if (await this.repo.crearCodigo(sys, userId, codigo)) return codigo
    }
    throw new DomainError("CONFLICT", "No pudimos crear tu código. Intenta de nuevo.")
  }
}
