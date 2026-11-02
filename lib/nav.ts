// Menú efectivo de Mirai 4.0 (inventario-1 §4.2) llevado a rutas de Next.js.
export type NavLeaf = { id: string; label: string; icon: string; href: string }
export type NavGroup = { g: string; label: string; icon: string; iso: string; items: NavLeaf[] }
export type NavSection = { sec: string; entries: (NavLeaf | NavGroup)[] }

const leaf = (id: string, label: string, icon: string): NavLeaf => ({ id, label, icon, href: `/${id}` })

export const NAV: NavSection[] = [
  { sec: "General", entries: [leaf("puesta", "Puesta en marcha", "rocket"), leaf("inicio", "Inicio", "house"), leaf("consejero", "Consejero IA", "sparkles")] },
  {
    sec: "Finanzas",
    entries: [
      { g: "dinero", label: "Mi dinero", icon: "wallet", iso: "ingresos", items: [
        leaf("balance", "Balance y quincenas", "scale"), leaf("ingresos", "Ingresos", "arrow-down-to-line"),
        leaf("gastos", "Gastos y hormiga", "receipt"), leaf("fijos", "Gastos fijos", "house"),
        leaf("tarjetas", "Tarjetas de crédito", "credit-card"), leaf("suscripciones", "Suscripciones", "repeat"),
        leaf("correo", "Correo del banco", "mail"), leaf("importar", "Importar extractos", "file-up"),
      ] },
      { g: "prestamos", label: "Préstamos y deudas", icon: "handshake", iso: "me-deben", items: [
        leaf("me-deben", "Me deben", "hand-coins"), leaf("le-debo", "Le debo", "landmark"),
        leaf("contactos", "Contactos", "users"), leaf("estrategia", "Salir de deudas", "trending-down"),
      ] },
      { g: "plan", label: "Planeación", icon: "target", iso: "metas", items: [
        leaf("presupuesto", "Presupuesto 50/30/20", "chart-pie"), leaf("flujo", "Flujo de caja", "chart-line"),
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

/** Lista plana de páginas: buscador ⌘K, selector de vista inicial, migas. */
export const PAGES: (NavLeaf & { section: string; group?: NavGroup })[] = NAV.flatMap((s) =>
  s.entries.flatMap((e) => (isGroup(e) ? e.items.map((i) => ({ ...i, section: s.sec, group: e })) : [{ ...e, section: s.sec }])),
)

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
