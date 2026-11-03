// Puerto para «Probar» una automatización (testAutomation de apps/web/features/automations/actions.ts): arma un evento
// de ejemplo con los datos reales del libro (sampleEvent) y corre el motor en simulación (runGraph con dryRun), sin
// escribir nada. El adaptador usa @mirai/services (loadCtx con la clave del sistema, como la web: el motor lee el libro
// completo, categorías y personas del hogar); BookGuard ya revisó que la persona sea miembro del libro.
import { Injectable } from "@nestjs/common"
import { todayBogota } from "@mirai/domain/dates"
import { runGraph } from "@mirai/domain/automations/engine"
import { triggerOf } from "@mirai/domain/automations/schema"
import type { Graph, RunResult } from "@mirai/domain/automations/types"
import { sampleEvent } from "@mirai/services/automations/detect"
import { loadCtx } from "@mirai/services/automations/server"

export type SimInput = { bookId: string; graph: Graph; monto?: number | null; descripcion?: string | null }
export type SimResult = RunResult & { evento: { descripcion: string; monto: number | null; fecha: string } }

export abstract class AutomationsTester {
  abstract simulate(i: SimInput): Promise<SimResult>
}

@Injectable()
export class ServicesAutomationsTester extends AutomationsTester {
  async simulate({ bookId, graph, monto, descripcion }: SimInput): Promise<SimResult> {
    const trigger = triggerOf(graph)
    if (!trigger) throw new Error("sin disparador")
    const ctx = await loadCtx(bookId)
    const hoy = todayBogota()
    const ev = sampleEvent(trigger, ctx.book, hoy, ctx.extras)
    if (monto != null) ev.data.monto = monto
    if (descripcion) ev.data.descripcion = descripcion
    const r = await runGraph(graph, ev, { dryRun: true, refs: ctx.refs, validate: false })
    return { ...r, evento: { descripcion: String(ev.data.descripcion ?? ""), monto: ev.data.monto === undefined ? null : Number(ev.data.monto), fecha: String(ev.data.fecha ?? hoy) } }
  }
}
