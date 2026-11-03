// Módulo `admin console` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I.
// Endpoints: Consola de la plataforma (@PlatformAdmin; nunca montos ni movimientos).
// Aquí van sus DTO zod (uno por acción de features/admin/*) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "admin", owner: "F2-I" } as const
