// Lecturas del plan (V7-G): los planes públicos (usePlans de features/planes/premium.tsx y la portada,
// features/landing/precios.tsx) y «Mi plan» del hogar (features/planes/plan-tab.tsx: RPC household_subscription para
// cualquier integrante y los pagos del plan solo para el dueño, igual que la RLS de plan_payments).
import { Injectable } from "@nestjs/common"
import type { HouseholdSubscription, PublicPlan } from "@mirai/contracts/modules/billing"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { RowStore } from "../../core/store/row-store"
import { num } from "../book-tables/http"
import { HouseholdAccess } from "../households/household-access"

/** Los planes no tienen dueño: sin sesión se leen con la clave del sistema (la RLS ya los deja ver a `anon`). */
const PUBLIC = systemScope("planes públicos (/planes y portada)")
const PAY_COLS = ["id", "proveedor", "referencia", "periodo", "monto", "estado", "metodo", "paid_at", "created_at", "factura_ref", "plan"] as const

const limites = (v: unknown): PublicPlan["limites"] => {
  const l = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  return Object.fromEntries((["libros", "personas", "automatizaciones"] as const).filter((k) => typeof l[k] === "number").map((k) => [k, l[k] as number]))
}

@Injectable()
export class PlansReadService {
  constructor(
    private readonly store: RowStore,
    private readonly access: HouseholdAccess,
    private readonly ctx: RequestContextService,
  ) {}

  async publicPlans(): Promise<PublicPlan[]> {
    const rows = await this.store.select<Record<string, unknown>>(PUBLIC, "plans", { eq: { publico: true, activo: true }, order: [{ column: "orden" }, { column: "precio_mes" }] })
    return rows.map((p) => ({
      id: String(p.id), nombre: String(p.nombre), descripcion: String(p.descripcion ?? ""), precio_mes: num(p.precio_mes), precio_anio: num(p.precio_anio),
      funciones: (p.funciones as string[] | null) ?? [], anuncios: !!p.anuncios, limites: limites(p.limites), destacado: !!p.destacado, orden: num(p.orden),
    }))
  }

  async subscription(householdId: string): Promise<HouseholdSubscription> {
    const h = await this.access.of(householdId)
    const scope = this.ctx.db
    const raw = await this.store.rpc(scope, "household_subscription", { h: householdId })
    const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
    const sub = first ? { id: String(first.id), plan: String(first.plan), periodo: String(first.periodo), estado: String(first.estado), proveedor: String(first.proveedor), vence_at: (first.vence_at as string | null) ?? null } : null
    if (h.access !== "owner") return { sub, pagos: null }
    const pays = await this.store.select<Record<string, unknown>>(scope, "plan_payments", { columns: PAY_COLS, eq: { household_id: householdId }, neq: { estado: "pendiente" }, order: [{ column: "created_at", ascending: false }], limit: 50 })
    return {
      sub,
      pagos: pays.map((p) => ({
        id: String(p.id), proveedor: String(p.proveedor), referencia: String(p.referencia), periodo: (p.periodo as string | null) ?? null, monto: num(p.monto), estado: String(p.estado),
        metodo: (p.metodo as string | null) ?? null, paid_at: (p.paid_at as string | null) ?? null, created_at: String(p.created_at), factura_ref: (p.factura_ref as string | null) ?? null, plan: (p.plan as string | null) ?? null,
      })),
    }
  }
}
