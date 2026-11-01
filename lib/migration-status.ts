/** Fase de la migración en la que llega cada sección (docs/superpowers/specs/2026-10-31-migracion-nextjs-design.md §8). */
export const PHASE_OF: Record<string, string> = {
  puesta: "fase 1", inicio: "fase 1", balance: "fase 1", ingresos: "fase 1", gastos: "fase 1", fijos: "fase 1",
  tarjetas: "fase 1", suscripciones: "fase 1", importar: "fase 1",
  "me-deben": "fase 2", "le-debo": "fase 2", contactos: "fase 2", estrategia: "fase 2", metas: "fase 2", inversiones: "fase 2",
  presupuesto: "fase 3", flujo: "fase 3", retos: "fase 3", primas: "fase 3", familia: "fase 3", mesadas: "fase 3",
  compartidos: "fase 3", recordatorios: "fase 3", calendario: "fase 3", indicadores: "fase 3",
  correo: "fase 4", reportes: "fase 4",
  renta: "fase 5", contador: "fase 5",
  logros: "fase 7", novedades: "fase 7", faq: "fase 7", manual: "fase 7", perfil: "fase 7",
}
