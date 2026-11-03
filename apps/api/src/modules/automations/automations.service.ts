// Casos de uso de las automatizaciones (V7-G, E10): CRUD con las reglas del editor de la web, probar, plantillas por
// defecto, historial y procesar la cola del libro. Tablas con RowStore y el JWT de la persona (UserScope: la RLS de
// `automations` exige «Edita» para escribir y deja leer a todos los miembros); el motor del servidor (AutomationsRunner)
// usa la clave del sistema, igual que runPendingAutomations de la web. No conoce Supabase.
import { Injectable } from "@nestjs/common"
import type { AutomationUpsert, TestResult } from "@mirai/contracts/modules/automations"
import { activeLimit, canUseAi } from "@mirai/domain/automations/limits"
import { parseGraph, triggerOf, validateGraph, type Issue } from "@mirai/domain/automations/schema"
import { automationFromTemplate, DEFAULT_TEMPLATES } from "@mirai/domain/automations/templates"
import type { Graph } from "@mirai/domain/automations/types"
import { atLeast } from "@mirai/domain/household/roles"
import type { Row } from "@mirai/db/tables"
import { planMsg } from "../../core/context/book.guard"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { EventsService } from "../../core/events/events.service"
import { RowStore, type Rec } from "../../core/store/row-store"
import { AutomationsRunner } from "./automations.port"
import { AutomationsTester } from "./automations.tester"

type Auto = Row<"automations">

export const NOT_FOUND_MSG = "No encontramos esa automatización."
export const TRASHED_MSG = "Esta automatización está en la papelera. Restáurala para editarla."
export const NEW_MSG = "Para crear una automatización escribe el nombre y arma el diagrama."
/** El mismo texto del trigger automation_limit (supabase/migrations/20261103003400_planes_automat.sql). */
export const limitMsg = (lim: number) => `Tu plan permite ${lim} automatizaciones activas a la vez. Pausa otra o cambia de plan para tener más.`
const LIMIT_RE = /^Tu plan permite \d+ automatizaciones activas/

const hasAi = (g: Graph) => g.nodes.some((n) => n.kind === "ia")

@Injectable()
export class AutomationsService {
  constructor(
    private readonly rows: RowStore,
    private readonly ctx: RequestContextService,
    private readonly events: EventsService,
    private readonly runner: AutomationsRunner,
    private readonly tester: AutomationsTester,
  ) {}

  private get bookId() {
    return this.ctx.book.book.id
  }

  list(): Promise<Auto[]> {
    return this.rows.select<Auto>(this.ctx.db, "automations", { eq: { book_id: this.bookId, deleted_at: null }, order: [{ column: "created_at" }] })
  }

  async get(id: string): Promise<Auto> {
    const a = await this.rows.first<Auto>(this.ctx.db, "automations", { eq: { id, book_id: this.bookId, deleted_at: null } })
    if (!a) throw DomainError.notFound(NOT_FOUND_MSG)
    return a
  }

  /** Activas del libro sin contar `exceptId`. */
  private activeOthers(exceptId: string) {
    return this.rows.count(this.ctx.db, "automations", { eq: { book_id: this.bookId, activo: true, deleted_at: null }, neq: { id: exceptId } })
  }

  /** ¿Cabe una activa más en el plan? (activeLimit = plan_automation_limit de la base). */
  private async fits(exceptId: string): Promise<{ ok: boolean; lim: number | null }> {
    const lim = activeLimit(this.ctx.book.plan)
    if (lim === null) return { ok: true, lim }
    return { ok: (await this.activeOthers(exceptId)) < lim, lim }
  }

  /** El trigger automation_limit responde con su texto (P0001 → VALIDATION): aquí es un conflicto con el plan. */
  private limitError(e: unknown): never {
    if (e instanceof DomainError && e.code === "VALIDATION" && LIMIT_RE.test(e.msg)) throw DomainError.conflict(e.msg)
    throw e
  }

  async put(id: string, body: AutomationUpsert): Promise<{ automation: Auto; pausada: boolean; issues: Issue[] }> {
    const scope = this.ctx.db
    const prev = await this.rows.first<Auto>(scope, "automations", { eq: { id, book_id: this.bookId } })
    if (prev?.deleted_at) throw DomainError.conflict(TRASHED_MSG)
    if (!prev && (!body.nombre || !body.grafo)) throw DomainError.validation(NEW_MSG)

    const grafo = (body.grafo as Graph | undefined) ?? parseGraph(prev?.grafo)
    const { ok: valid, issues } = validateGraph(grafo)
    let activo = body.activo ?? prev?.activo ?? false
    let pausada = false
    if (activo && !valid) {
      // Como el editor: activar a propósito con pendientes es un error; guardar una activa con pendientes la pausa.
      if (body.activo === true) throw DomainError.validation(`Revisa la automatización antes de activarla: ${issues[0]?.msg ?? "tiene pasos sin completar"}.`, { issues })
      activo = false
      pausada = true
    }
    if (activo) {
      if (hasAi(grafo) && !canUseAi(this.ctx.book.plan)) throw DomainError.plan(planMsg("ia"))
      if (!prev?.activo) {
        const f = await this.fits(id)
        if (!f.ok) throw DomainError.conflict(limitMsg(f.lim!), { limite: f.lim })
      }
    }

    const disparador = triggerOf(grafo)?.kind ?? prev?.disparador ?? "gasto"
    const patch: Rec = { activo, disparador, nombre: body.nombre, descripcion: body.descripcion, icon: body.icon, grafo: body.grafo }
    let saved: Auto | undefined
    try {
      saved = prev
        ? (await this.rows.update<Auto>(scope, "automations", { eq: { id, book_id: this.bookId, deleted_at: null } }, patch))[0]
        : (await this.rows.insert<Auto>(scope, "automations", [{ ...patch, id, book_id: this.bookId, created_by: this.ctx.user.id, plantilla: null, descripcion: body.descripcion ?? "", icon: body.icon ?? "workflow" }]))[0]
    } catch (e) {
      this.limitError(e)
    }
    if (!saved) throw DomainError.notFound(NOT_FOUND_MSG)
    this.events.changed(this.bookId, ["automations"], id, prev ? "UPDATE" : "INSERT")
    return { automation: saved, pausada: pausada && !!prev?.activo, issues }
  }

  async remove(id: string): Promise<Auto> {
    const [a] = await this.rows.update<Auto>(this.ctx.db, "automations", { eq: { id, book_id: this.bookId, deleted_at: null } }, { deleted_at: new Date().toISOString() })
    if (!a) throw DomainError.notFound(NOT_FOUND_MSG)
    this.events.changed(this.bookId, ["automations"], id, "DELETE")
    return a
  }

  /** «Deshacer»: vuelve de la papelera. Si estaba activa y ya no cabe en el plan, vuelve en pausa (el trigger la rechazaría). */
  async restore(id: string): Promise<Auto> {
    const scope = this.ctx.db
    const prev = await this.rows.first<Auto>(scope, "automations", { eq: { id, book_id: this.bookId }, notNull: ["deleted_at"] })
    if (!prev) throw DomainError.notFound(NOT_FOUND_MSG)
    const activo = prev.activo && validateGraph(parseGraph(prev.grafo)).ok && (await this.fits(id)).ok
    let a: Auto | undefined
    try {
      ;[a] = await this.rows.update<Auto>(scope, "automations", { eq: { id, book_id: this.bookId }, notNull: ["deleted_at"] }, { deleted_at: null, activo })
    } catch (e) {
      this.limitError(e)
    }
    if (!a) throw DomainError.notFound(NOT_FOUND_MSG)
    this.events.changed(this.bookId, ["automations"], id, "UPDATE")
    return a
  }

  async test(id: string, input: { graph?: unknown; monto?: number | null; descripcion?: string | null }): Promise<TestResult> {
    const saved = await this.get(id)
    const graph = (input.graph as Graph | undefined) ?? parseGraph(saved.grafo)
    const issues = validateGraph(graph).issues
    if (!triggerOf(graph)) throw DomainError.validation("Agrega un disparador para poder probar.", { issues })
    try {
      const r = await this.tester.simulate({ bookId: this.bookId, graph, monto: input.monto, descripcion: input.descripcion })
      return { status: r.status, steps: r.steps, issues, evento: r.evento }
    } catch (e) {
      throw DomainError.upstream("No pudimos probar la automatización. Intenta de nuevo en un momento.", e)
    }
  }

  /**
   * ensureDefaultAutomations: crea las plantillas `porDefecto` que el libro nunca tuvo (única por libro y plantilla,
   * aunque se hayan borrado no vuelven). «Ver» y «Registra sus gastos» no crean nada (0). Si no cabe una activa más
   * en el plan, se crea en pausa.
   */
  async defaults(): Promise<{ creadas: number }> {
    if (!atLeast(this.ctx.book.access, "editor")) return { creadas: 0 }
    const scope = this.ctx.db
    const ya = await this.rows.select<{ plantilla: string }>(scope, "automations", { columns: ["plantilla"], eq: { book_id: this.bookId }, notNull: ["plantilla"] })
    const have = new Set(ya.map((r) => r.plantilla))
    const lim = activeLimit(this.ctx.book.plan)
    let activas = lim === null ? 0 : await this.rows.count(scope, "automations", { eq: { book_id: this.bookId, activo: true, deleted_at: null } })
    let creadas = 0
    for (const t of DEFAULT_TEMPLATES.filter((x) => !have.has(x.key))) {
      const base = automationFromTemplate(t, { asDefault: true })
      const row: Rec = { ...base, id: crypto.randomUUID(), book_id: this.bookId, created_by: this.ctx.user.id }
      if (row.activo && ((lim !== null && activas >= lim) || (t.premium && !canUseAi(this.ctx.book.plan)))) row.activo = false
      let out: unknown[]
      try {
        out = await this.rows.upsert(scope, "automations", [row], { onConflict: ["book_id", "plantilla"], ignoreDuplicates: true })
      } catch (e) {
        if (!row.activo) throw e
        out = await this.rows.upsert(scope, "automations", [{ ...row, activo: false }], { onConflict: ["book_id", "plantilla"], ignoreDuplicates: true })
        row.activo = false
      }
      if (out.length) {
        creadas++
        if (row.activo) activas++
      }
    }
    if (creadas) this.events.changed(this.bookId, ["automations"], undefined, "INSERT")
    return { creadas }
  }

  runs(q: { automationId?: string; limit: number }): Promise<Row<"automation_runs">[]> {
    return this.rows.select(this.ctx.db, "automation_runs", {
      eq: { book_id: this.bookId, deleted_at: null, ...(q.automationId ? { automation_id: q.automationId } : {}) },
      order: [{ column: "created_at", ascending: false }],
      limit: q.limit,
    })
  }

  /** runPendingAutomations: la cola del libro y sus disparadores por estado, ya (reclamo atómico: no duplica con el cron). */
  async drain(): Promise<{ procesados: number }> {
    try {
      return { procesados: (await this.runner.processBook(this.bookId)).length }
    } catch (e) {
      throw DomainError.upstream("No pudimos revisar tus automatizaciones ahora. Lo intentamos de nuevo en unos minutos.", e)
    }
  }
}
