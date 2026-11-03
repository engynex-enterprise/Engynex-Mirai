// Módulo `auth` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-B.
// Endpoints: GET /v1/me (contexto: usuario, hogares, libros, plan y admin; reemplaza getAppContext).
// Aquí van sus DTO zod (AppContext) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "me", owner: "F2-B" } as const
