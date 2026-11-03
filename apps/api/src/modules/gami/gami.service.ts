// Logros (F2-C-6): lo mismo que useGami de la web (puntos, nivel, racha, misiones e insignias) con @mirai/domain/gami
// sobre el libro completo de book-tables. Referidos: lo mismo que misReferidos. No conoce Supabase.
import { Injectable } from "@nestjs/common"
import type { GamiView, Referidos } from "@mirai/contracts/modules/gami"
import { todayBogota } from "@mirai/domain/dates"
import { GBADGES, gamiPending, gamiXP, misionesSemana, nivel, puntuales, racha, rachaMax, type GamiInput } from "@mirai/domain/gami"
import { MAX_RECOMPENSAS, nuevoCodigo } from "@mirai/domain/referidos"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
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
  ) {}

  async get(hoy?: string): Promise<GamiView> {
    const today = hoy ?? todayBogota()
    const [book, st] = await Promise.all([this.tables.loadBook(today), this.repo.state(this.ctx.db, { bookId: this.ctx.book.book.id, userId: this.ctx.user.id })])
    const G: GamiInput = { book, perfilNombre: st.nombre, fondo: st.fondo, retos: st.retos, consejos: st.consejos, chats: st.chats, visitas: st.visitas, unl: st.unl, mis: st.mis }
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
      puntuales: puntuales(book, today),
      insignias: GBADGES.map(({ id, n, d, icon, tier }) => ({ id, n, d, icon, tier, unlocked_at: st.unl[id] ?? null })),
      pendientes: { badges: pend.badges.map((b) => b.id), missions: pend.missions.map((m) => m.k) },
      estado: { visitas: new Set(st.visitas).size, maxLevel: st.maxLevel, init: st.init, chats: st.chats, consejos: st.consejos },
    }
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
