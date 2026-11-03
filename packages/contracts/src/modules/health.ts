// Módulo `health & meta` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-B.
// Endpoints: /healthz, /readyz, /v1/version y /docs (solo en pruebas).
// Aquí van sus DTO zod (—) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "health", owner: "F2-B" } as const
