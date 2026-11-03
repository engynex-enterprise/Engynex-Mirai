// Módulo `chat` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-F.
// Endpoints: Mensajes en streaming NDJSON, hilos, propuestas (confirmar/cancelar), adjuntos y sugerencias.
// Aquí van sus DTO zod (ChatBody, ChatEvent) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "chat", owner: "F2-F" } as const
