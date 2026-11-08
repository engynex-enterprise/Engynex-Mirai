// Consola › Planes, Cupones y Comunicados por la API: /v1/admin/{plans,coupons,broadcasts} (@PlatformAdmin y
// admin_audit en la API). Todas lanzan Error con el mensaje para la persona (en español, como lo muestran los paneles).
const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().admin, unwrap, unwrapData }
}

// ── Planes ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type PlanFull = { id: string; nombre: string; descripcion: string; precio_mes: number; precio_anio: number; funciones: string[]; anuncios: boolean; limites: { libros?: number; personas?: number; automatizaciones?: number }; activo: boolean; publico: boolean; destacado: boolean; orden: number }

/** Todos los planes (también los ocultos), en el orden de Planes. */
export async function loadAdminPlans(): Promise<PlanFull[]> {
  const { a, unwrap } = await api()
  return unwrap(await a.plans()) as unknown as PlanFull[]
}

/** Opciones de los selectores de la consola. */
export async function loadPlanOptions(): Promise<{ value: string; label: string; mes: number; anio: number }[]> {
  return (await loadAdminPlans()).sort((x, y) => x.orden - y.orden).map((p) => ({ value: p.id, label: p.nombre, mes: p.precio_mes, anio: p.precio_anio }))
}

const EXISTE_PLAN = "Ya existe un plan con ese nombre."

/** Crea (`isNew`) o edita un plan. */
export async function savePlan(id: string, isNew: boolean, row: Omit<PlanFull, "id">): Promise<void> {
  const { a, unwrap, unwrapData } = await api()
  // PUT crea o edita: un plan nuevo con el identificador de otro lo pisaría, así que se revisa antes.
  if (isNew && unwrap(await a.plans()).some((p) => p.id === id)) throw new Error(EXISTE_PLAN)
  const { nombre, descripcion, precio_mes, precio_anio, funciones, anuncios, limites, activo, publico, destacado, orden } = row
  unwrapData(await a.savePlan({ params: { planId: id }, body: { nombre, descripcion, precio_mes, precio_anio, funciones: funciones as never, anuncios, limites, activo, publico, destacado, orden } }))
}

export async function deletePlan(id: string): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.deletePlan({ params: { planId: id } }))
}

// ── Cupones ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type CouponFull = { codigo: string; descripcion: string; tipo: "porcentaje" | "valor"; valor: number; planes: string[]; periodos: string[]; desde: string | null; hasta: string | null; max_usos: number | null; usos: number; activo: boolean; created_at?: string }
type CouponFields = Omit<CouponFull, "codigo" | "usos" | "created_at">

export async function loadCoupons(): Promise<CouponFull[]> {
  const { a, unwrap } = await api()
  return unwrap(await a.coupons()) as unknown as CouponFull[]
}

const EXISTE_CUPON = "Ya existe un cupón con ese código."
const couponBody = (c: CouponFields) => ({ descripcion: c.descripcion, tipo: c.tipo, valor: c.valor, planes: c.planes, periodos: c.periodos as ("mes" | "anio")[], desde: c.desde, hasta: c.hasta, max_usos: c.max_usos, activo: c.activo })

/** Crea (`isNew`) o edita un cupón (el código no cambia al editar). */
export async function saveCoupon(isNew: boolean, codigo: string, row: CouponFull): Promise<void> {
  const { a, unwrap, unwrapData } = await api()
  if (isNew && unwrap(await a.coupons()).some((c) => c.codigo === codigo)) throw new Error(EXISTE_CUPON)
  unwrapData(await a.saveCoupon({ params: { codigo }, body: couponBody(row) }))
}

export async function deleteCoupon(codigo: string): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.deleteCoupon({ params: { codigo } }))
}

/** Pausa o activa un cupón. */
export async function toggleCoupon(c: CouponFull): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.saveCoupon({ params: { codigo: c.codigo }, body: couponBody({ ...c, activo: !c.activo }) }))
}

// ── Comunicados ─────────────────────────────────────────────────────────────────────────────────────────────────

export type BroadcastRow = { id: string; titulo: string; cuerpo: string; href: string | null; segmento: string; enviados: number; created_by: string | null; created_at: string }

/** Los 100 comunicados más recientes. */
export async function loadBroadcasts(): Promise<BroadcastRow[]> {
  const { a, unwrap } = await api()
  return unwrap(await a.broadcasts())
}
