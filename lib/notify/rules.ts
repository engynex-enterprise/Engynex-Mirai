// Tipos de aviso y canales (NEV / NCH de la v4) con la matriz por defecto (defMat). Isomórfico.

export const AVISOS = [
  { k: "pagos", t: "Pagos por vencer y vencidos", icon: "receipt", d: "Gastos fijos, cuotas, empeños y aportes de ahorro.", kind: "pago" },
  { k: "cobros", t: "Cuotas que te deben pagar", icon: "hand-coins", d: "Cuando alguien que te debe tiene una cuota próxima o atrasada.", kind: "cobro" },
  { k: "hormiga", t: "Gastos hormiga", icon: "coffee", d: "Cuando te acercas o pasas tu límite mensual.", kind: "hormiga" },
  { k: "presupuesto", t: "Presupuesto", icon: "chart-pie", d: "Cuando una categoría llega al porcentaje que definas.", kind: "presupuesto" },
  { k: "inversiones", t: "Inversiones", icon: "trending-up", d: "Cuando un CDT o inversión está por vencer.", kind: "inversion" },
  { k: "metas", t: "Metas", icon: "target", d: "Cuando una meta está cerca de su fecha.", kind: "meta" },
  { k: "tarjetas", t: "Tarjetas de crédito", icon: "credit-card", d: "Cuando llega la fecha de corte o usas más del 30 % del cupo.", kind: "tarjeta" },
  { k: "empenos", t: "Empeños y garantías", icon: "gem", d: "Cuando se acerca la fecha límite para recuperar lo empeñado.", kind: "empeno" },
  { k: "mesadas", t: "Mesadas", icon: "piggy-bank", d: "Cuando toca entregar la mesada de alguien del hogar.", kind: "mesada" },
  { k: "compartidos", t: "Gastos compartidos", icon: "split", d: "Cuando en un grupo te deben o debes plata.", kind: "compartido" },
] as const
export type AvisoKey = (typeof AVISOS)[number]["k"]

export const CANALES = [
  { k: "app", t: "En la app", icon: "bell" },
  { k: "email", t: "Correo", icon: "mail" },
  { k: "telegram", t: "Telegram", icon: "send" },
  { k: "push", t: "Push", icon: "bell-ring" },
  { k: "whatsapp", t: "WhatsApp", icon: "message-circle" },
] as const
export type CanalKey = (typeof CANALES)[number]["k"]

export type Matriz = Partial<Record<AvisoKey, Partial<Record<CanalKey, boolean>>>>
/** Canales activos del usuario (interruptor general de cada canal). */
export type Canales = Partial<Record<CanalKey, boolean>> & { popup?: boolean }

const URGENT: AvisoKey[] = ["pagos", "cobros", "empenos"]
export function defaultMatriz(): Matriz {
  return Object.fromEntries(AVISOS.map(({ k }) => [k, {
    app: true, email: URGENT.includes(k) || k === "inversiones", telegram: URGENT.includes(k) || k === "inversiones", push: URGENT.includes(k), whatsapp: URGENT.includes(k),
  }])) as Matriz
}

/**
 * Los empeños antes viajaban como "pagos": mientras la persona no toque su fila, siguen la de pagos (nadie deja de
 * recibir lo que ya recibía). Los demás tipos nuevos usan la matriz por defecto (solo en la app).
 */
const HEREDA: Partial<Record<AvisoKey, AvisoKey>> = { empenos: "pagos" }

/** ¿Este aviso sale por este canal? (app: mientras no sea false; los demás: deben estar en true). */
export function onFor(m: Matriz | null | undefined, aviso: AvisoKey, canal: CanalKey) {
  const own = m && Object.keys(m).length ? m : null
  const fila = own ? own[aviso] ?? (HEREDA[aviso] ? own[HEREDA[aviso]!] : undefined) ?? defaultMatriz()[aviso] : defaultMatriz()[aviso]
  const v = fila?.[canal]
  return canal === "app" ? v !== false : v === true
}

/** Categoría de un aviso por el prefijo de su id (nCat de la v4 + tipos de la v5). */
export function avisoOf(id: string): AvisoKey {
  const p = id.split(":")[0]
  return ({ b: "presupuesto", c: "cobros", h: "hormiga", i: "inversiones", m: "metas", p: "pagos", pr: "empenos", t: "tarjetas", ms: "mesadas", sg: "compartidos" } as Record<string, AvisoKey>)[p] ?? "pagos"
}

/** Horario de silencio (cruza la medianoche si desde > hasta). */
export const enSilencio = (h: number, s: { on?: boolean; desde?: number; hasta?: number } | null | undefined) =>
  !!s?.on && (Number(s.desde) > Number(s.hasta) ? h >= Number(s.desde) || h < Number(s.hasta) : h >= Number(s.desde) && h < Number(s.hasta))

/** Destino enmascarado para el registro de envíos: al•••@gmail.com · +57 315 ••• 4567 · chat •••1234. */
export function maskDest(canal: Exclude<CanalKey, "app">, dest: string | null | undefined) {
  const d = String(dest ?? "").trim()
  if (!d) return null
  if (canal === "email") { const [u, dom] = d.split("@"); return dom ? `${u.slice(0, 2)}•••@${dom}` : "•••" }
  if (canal === "whatsapp") { const n = d.replace(/\D/g, ""); return n.length >= 10 ? `+${n.slice(0, -10)} ${n.slice(-10, -7)} ••• ${n.slice(-4)}`.replace(/^\+ /, "") : "•••" }
  return `•••${d.slice(-4)}`
}
