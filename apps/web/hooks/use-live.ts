"use client"

// Interruptor de la fuente del tiempo real (v6 F2-G, `live=supabase|gateway`).
// - `supabase` (por defecto, y si falta algo): Supabase Realtime, exactamente como hasta hoy (hooks/use-realtime.ts).
// - `gateway`: el gateway socket.io de la API (hooks/use-live-gateway.ts). Necesita NEXT_PUBLIC_LIVE_SOURCE=gateway Y
//   NEXT_PUBLIC_REALTIME_URL. Entra en producción con Cloud SQL (fase 4), cuando el trigger pg_notify reemplace la
//   publicación supabase_realtime. Volver atrás = quitar la variable y volver a desplegar.
// Las variables NEXT_PUBLIC_* se fijan al compilar, así que la elección no cambia entre renders (reglas de los hooks).
import { liveSource } from "@mirai/contracts/modules/realtime"
import { REALTIME_URL, useLiveGateway } from "./use-live-gateway"
import { useBookRealtime } from "./use-realtime"

export const LIVE_SOURCE = liveSource(process.env.NEXT_PUBLIC_LIVE_SOURCE) === "gateway" && REALTIME_URL ? "gateway" : "supabase"

/** Cambios en vivo y presencia del libro: `{ status, online }` con la fuente elegida. */
export const useBookLive: typeof useBookRealtime = LIVE_SOURCE === "gateway" ? useLiveGateway : useBookRealtime
