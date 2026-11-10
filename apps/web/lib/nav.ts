// Menú efectivo de Mirai 4.0 (inventario-1 §4.2) llevado a rutas de Next.js.
export type NavLeaf = { id: string; label: string; icon: string; href: string; /** Otras páginas que se muestran dentro de esta (pestañas). */ alias?: string[] }
export type NavGroup = { g: string; label: string; icon: string; iso: string; items: NavLeaf[] }
export type NavSection = { sec: string; entries: (NavLeaf | NavGroup)[] }

const leaf = (id: string, label: string, icon: string): NavLeaf => ({ id, label, icon, href: `/${id}` })

export const NAV: NavSection[] = [
  // Cada módulo tiene su entrada en el menú; los que van juntos son además pestañas de una misma página (PAGE_TABS):
  // Inicio · Dashboard · Balance, Ingresos · Me deben, y las pestañas de Gastos con Le debo.
  { sec: "General", entries: [
    leaf("puesta", "Puesta en marcha", "rocket"),
    { g: "inicio", label: "Inicio", icon: "house", iso: "inicio", items: [
      leaf("inicio", "Inicio", "house"), leaf("dashboard", "Dashboard", "layout-dashboard"), leaf("balance", "Balance", "scale"),
    ] },
    leaf("consejero", "Consejero IA", "sparkles"),
  ] },
  {
    sec: "Finanzas",
    entries: [
      { g: "ingresos", label: "Ingresos", icon: "arrow-down-to-line", iso: "ingresos", items: [
        leaf("ingresos", "Ingresos", "arrow-down-to-line"), leaf("me-deben", "Me deben", "hand-coins"),
      ] },
      { g: "gastos", label: "Gastos", icon: "receipt", iso: "gastos", items: [
        leaf("gastos-todos", "Todos los gastos", "layers"), leaf("gastos", "Del día a día", "receipt"), leaf("fijos", "Gastos fijos", "house"),
        leaf("suscripciones", "Suscripciones", "repeat"), leaf("tarjetas", "Tarjetas de crédito", "credit-card"), leaf("le-debo", "Le debo", "landmark"),
      ] },
      // Contactos: a quién le pagas o le prestas. Ya no es un módulo, es este grupo.
      { g: "contactos", label: "Contactos", icon: "contact", iso: "contactos", items: [
        leaf("proveedores", "Proveedores", "store"), leaf("personas", "Personas", "users"),
      ] },
      // Traer movimientos sin escribirlos: desde el correo del banco o un extracto.
      { g: "importar", label: "Importar movimientos", icon: "file-up", iso: "importar", items: [
        leaf("correo", "Correo del banco", "mail"), leaf("importar", "Importar extractos", "file-up"),
      ] },
      { g: "plan", label: "Planeación", icon: "target", iso: "metas", items: [
        leaf("presupuesto", "Presupuesto 50/30/20", "chart-pie"), leaf("flujo", "Flujo de caja", "chart-line"),
        leaf("estrategia", "Salir de deudas", "trending-down"),
        leaf("metas", "Metas y emergencia", "piggy-bank"), leaf("retos", "Retos de ahorro", "trophy"),
        leaf("logros", "Logros y nivel", "medal"), leaf("primas", "Primas y cesantías", "gift"),
        leaf("familia", "Por miembro", "users"), leaf("mesadas", "Mesada de los hijos", "baby"),
        leaf("compartidos", "Gastos compartidos", "split"),
        leaf("deseos", "Lista de deseos", "heart"), leaf("calculadoras", "Calculadoras", "calculator"),
      ] },
      leaf("inversiones", "Inversiones", "trending-up"),
    ],
  },
  { sec: "Impuestos", entries: [
    { g: "dian", label: "DIAN", icon: "landmark", iso: "renta", items: [
      leaf("renta", "Declaración de renta", "file-check"), leaf("calendario", "Calendario fiscal y laboral", "calendar"),
      leaf("contador", "Acceso de tu contador", "user-round-check"),
    ] },
  ] },
  { sec: "Seguimiento", entries: [
    { g: "agenda", label: "Agenda", icon: "calendar-days", iso: "calendario", items: [leaf("recordatorios", "Próximos pagos", "bell")] },
    { g: "informes", label: "Informes", icon: "chart-column", iso: "reportes", items: [
      leaf("informes", "Informes a tu medida", "chart-bar"),
      leaf("indicadores", "Salud financiera", "gauge"), leaf("reportes", "Reportes y resumen IA", "file-text"),
    ] },
    leaf("automatizaciones", "Automatizaciones", "workflow"),
  ] },
  { sec: "Soporte", entries: [
    { g: "ayuda", label: "Centro de ayuda", icon: "life-buoy", iso: "ayuda", items: [
      leaf("novedades", "Novedades", "megaphone"), leaf("faq", "Preguntas frecuentes", "circle-help"),
      leaf("manual", "Manual e instructivos", "book-open"), leaf("academia", "Academia Mirai", "graduation-cap"),
      leaf("opiniones", "Tu opinión", "message-square-heart"),
    ] },
  ] },
  { sec: "Configuración", entries: [leaf("perfil", "Perfil", "user"), leaf("referidos", "Invita y gana", "gift"), leaf("ajustes", "Ajustes", "settings")] },
]

export const isGroup = (e: NavLeaf | NavGroup): e is NavGroup => "g" in e

/**
 * Páginas que no salen en el menú porque viven como pestaña de otra (`alias`), pero siguen teniendo ruta, migas y
 * entrada en ⌘K: grupo y sección donde se muestran.
 */
// Hoy todas las páginas con pestañas tienen además su entrada en el menú; la lista queda por si alguna vuelve a vivir
// solo como pestaña de otra.
const EN_PESTANAS: { leaf: NavLeaf; g?: string; sec?: string }[] = []

/** Lista plana de páginas: buscador ⌘K, selector de vista inicial, migas. */
export const PAGES: (NavLeaf & { section: string; group?: NavGroup })[] = [
  ...NAV.flatMap((s) =>
    s.entries.flatMap((e) => (isGroup(e) ? e.items.map((i) => ({ ...i, section: s.sec, group: e })) : [{ ...e, section: s.sec }])),
  ),
  ...EN_PESTANAS.flatMap(({ leaf: l, g, sec }) => {
    if (sec) return NAV.some((x) => x.sec === sec) ? [{ ...l, section: sec }] : []
    const s = NAV.find((x) => x.entries.some((e) => isGroup(e) && e.g === g))
    const group = s?.entries.find((e) => isGroup(e) && e.g === g) as NavGroup | undefined
    return s ? [{ ...l, section: s.sec, group }] : []
  }),
]

/** Página del menú que muestra a `id` (la misma o la que la tiene como pestaña). */
export const navIdOf = (id: string) => PAGES.find((p) => p.alias?.includes(id))?.id ?? id

/** Pestañas de las páginas que agrupan varias (Gastos: todos, del día a día, fijos… y Le debo; Ingresos y Me deben). */
export const PAGE_TABS: Record<string, { id: string; label: string; icon: string; desc: string }[]> = (() => {
  const gastos = [
    { id: "gastos-todos", label: "Todos", icon: "layers", desc: "Todo lo que sale, de todos lados, en una sola lista" },
    { id: "gastos", label: "Del día a día", icon: "receipt", desc: "Mercado, salidas, transporte y gastos hormiga" },
    { id: "fijos", label: "Fijos", icon: "house", desc: "Arriendo, servicios, cuotas: se repiten cada mes" },
    { id: "suscripciones", label: "Suscripciones", icon: "repeat", desc: "Netflix, Spotify, apps: se cobran solas" },
    { id: "tarjetas", label: "Tarjetas", icon: "credit-card", desc: "Compras con tarjeta, cuotas y el pago del mes" },
    { id: "le-debo", label: "Le debo", icon: "landmark", desc: "Créditos, préstamos y deudas: sus cuotas" },
  ]
  const ingresos = [
    { id: "ingresos", label: "Ingresos", icon: "arrow-down-to-line", desc: "Salario, honorarios y lo que te entra" },
    { id: "me-deben", label: "Me deben", icon: "hand-coins", desc: "Lo que prestaste y cómo te lo pagan" },
  ]
  const inicio = [
    { id: "inicio", label: "Inicio", icon: "house", desc: "Cómo va tu hogar hoy y qué hacer" },
    { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", desc: "Tus números en gráficas" },
    { id: "balance", label: "Balance", icon: "scale", desc: "Lo que tienes, lo que debes y tu mes" },
  ]
  return { inicio, dashboard: inicio, balance: inicio, gastos, "gastos-todos": gastos, fijos: gastos, suscripciones: gastos, tarjetas: gastos, "le-debo": gastos, ingresos, "me-deben": ingresos }
})()

export const pageById = (id: string) => PAGES.find((p) => p.id === id)

/** Barra inferior en móvil */
export const MOBILE_TABS = ["inicio", "gastos", "recordatorios", "consejero"] as const

/** Migas de pan de una sección: Inicio › Sección › Grupo (cada nivel lleva a su primera página). */
export function crumbsFor(id: string): { label: string; href?: string }[] {
  if (id === "inicio") return []
  const home = { label: "Inicio", href: "/inicio" }
  const page = pageById(id)
  if (!page) return [home]
  const firstOfSection = PAGES.find((p) => p.section === page.section)
  const out = [home]
  if (firstOfSection && page.section !== "General") out.push({ label: page.section, href: firstOfSection.href })
  if (page.group) out.push({ label: page.group.label, href: page.group.items[0].href })
  return out
}
