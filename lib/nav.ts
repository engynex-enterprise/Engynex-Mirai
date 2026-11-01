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
  ] },
  { sec: "Soporte", entries: [
    { g: "ayuda", label: "Ayuda", icon: "life-buoy", iso: "consejero", items: [
      leaf("novedades", "Novedades", "megaphone"), leaf("faq", "Preguntas frecuentes", "circle-help"),
      leaf("manual", "Manual e instructivos", "book-open"),
      leaf("opiniones", "Tu opinión", "message-square-heart"),
    ] },
  ] },
  { sec: "Configuración", entries: [leaf("perfil", "Perfil", "user"), leaf("ajustes", "Ajustes", "settings")] },
]

export const isGroup = (e: NavLeaf | NavGroup): e is NavGroup => "g" in e

/** Panel del dueño de Mirai: no está en NAV; el menú lo muestra solo a los administradores. */
export const ADMIN_PAGE: NavLeaf = { id: "admin", label: "Panel de administración", icon: "shield-check", href: "/admin" }

/** Lista plana de páginas: buscador ⌘K, selector de vista inicial, migas. */
export const PAGES: (NavLeaf & { section: string; group?: NavGroup })[] = NAV.flatMap((s) =>
  s.entries.flatMap((e) => (isGroup(e) ? e.items.map((i) => ({ ...i, section: s.sec, group: e })) : [{ ...e, section: s.sec }])),
)

export const pageById = (id: string) => PAGES.find((p) => p.id === id)

/** Barra inferior en móvil */
export const MOBILE_TABS = ["inicio", "gastos", "recordatorios", "consejero"] as const
