// Módulo `insights` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-C.
// Endpoints: Vistas de solo lectura (flujo integral, balance, dashboard, indicadores, agenda, hallazgos) y reportes.
// Aquí van sus DTO zod (salidas de @mirai/domain) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "insights", owner: "F2-C" } as const
