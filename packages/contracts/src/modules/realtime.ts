// Módulo `realtime gateway` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-G.
// Endpoints: WebSocket socket.io: join:book, presence:update, change, notification.
// Aquí van sus DTO zod (LiveChange (./live), PresenceUser) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "realtime", owner: "F2-G" } as const
