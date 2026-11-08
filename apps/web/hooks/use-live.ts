"use client"

// Cambios en vivo y presencia del libro: el gateway socket.io de la API (hooks/use-live-gateway.ts).
export { useLiveGateway as useBookLive, type LiveStatus, type PresenceUser } from "./use-live-gateway"
