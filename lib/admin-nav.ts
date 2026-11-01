// Menú de la consola de administración (/admin). Independiente del menú de la app.
export type AdminLeaf = { id: string; label: string; icon: string; href: string; desc: string }
export type AdminSection = { sec: string; items: AdminLeaf[] }

const l = (id: string, label: string, icon: string, desc: string): AdminLeaf => ({ id, label, icon, href: id ? `/admin/${id}` : "/admin", desc })

export const ADMIN_NAV: AdminSection[] = [
  { sec: "General", items: [l("", "Resumen", "layout-dashboard", "El negocio de un vistazo"), l("uso", "Uso y analítica", "activity", "Actividad por día y secciones más usadas")] },
  { sec: "Clientes", items: [l("usuarios", "Usuarios", "users", "Personas, perfiles y acciones de cuenta"), l("hogares", "Hogares", "house", "Cuentas familiares, integrantes y plan")] },
  { sec: "Negocio", items: [
    l("planes", "Planes", "crown", "Crea planes: precio, funciones y límites"), l("suscripciones", "Suscripciones", "repeat", "Quién tiene qué plan y hasta cuándo"),
    l("pagos", "Pagos e ingresos", "banknote", "Cobros, devoluciones y facturas"), l("cupones", "Cupones", "ticket-percent", "Descuentos con código"),
  ] },
  { sec: "Plataforma", items: [
    l("integraciones", "Integraciones globales", "plug", "Servicios que Mirai pone para todos"), l("anuncios", "Anuncios", "megaphone", "Publicidad del plan gratis"),
    l("comunicados", "Comunicados", "send", "Avisos masivos a los usuarios"),
  ] },
  { sec: "Soporte", items: [l("opiniones", "Opiniones", "message-square-heart", "Calificaciones, errores e ideas")] },
  { sec: "Sistema", items: [l("administradores", "Administradores", "shield-check", "Quién administra Mirai"), l("auditoria", "Auditoría", "scroll-text", "Todo lo que se hace en la consola"), l("sistema", "Ajustes y estado", "settings", "Aviso general, registro, límites y salud")] },
]
export const ADMIN_PAGES = ADMIN_NAV.flatMap((s) => s.items)
export const adminPage = (path: string) => ADMIN_PAGES.filter((p) => path === p.href || (p.id && path.startsWith(`${p.href}/`))).sort((a, b) => b.href.length - a.href.length)[0] ?? ADMIN_PAGES[0]

/** Nombre en español de cada tabla del registro de actividad (audit_log). */
export const TABLA_LABELS: Record<string, string> = {
  expenses: "Gastos", incomes: "Ingresos", extra_incomes: "Ingresos extra", fixed_expenses: "Gastos fijos", fixed_payments: "Pagos de fijos", loans: "Préstamos",
  loan_payments: "Abonos de préstamos", debts: "Deudas", debt_payments: "Abonos de deudas", contacts: "Contactos", goals: "Metas", goal_moves: "Movimientos de metas",
  subscriptions: "Suscripciones", cards: "Tarjetas", card_moves: "Movimientos de tarjetas", investments: "Inversiones", categories: "Categorías",
  income_categories: "Tipos de ingreso", payment_methods: "Medios de pago", entities: "Bancos y entidades", keyword_rules: "Reglas de importación",
  budgets: "Presupuesto", family_members: "Familia", household_members: "Integrantes del hogar", books: "Libros de cuentas", book_settings: "Ajustes",
  calendar_events: "Agenda", challenges: "Retos", allowances: "Mesadas", shared_expenses: "Gastos compartidos", tax_years: "Renta", tax_assets: "Bienes (renta)",
  attachments: "Adjuntos", accountant_notes: "Notas del contador", advisor_consultations: "Consultas al consejero", fund_moves: "Fondo de emergencia",
}
export const tablaLabel = (t: string) => TABLA_LABELS[t] ?? t.replace(/_/g, " ")
