"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { apiOn } from "@/lib/api/session"
import { gamiCheckLegacy, gamiVisitLegacy } from "./legacy"
import { qk } from "@/lib/supabase/tables"
import { gamiPending, todayBogota } from "@/lib/domain"
import { useGami } from "./use-gami"
import { logroNotifs } from "@/features/notify/api"

export async function confetti(n = 110) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const c = (await import("canvas-confetti")).default
  c({ particleCount: n, spread: 80, origin: { y: 0.6 }, colors: ["#9EDB4E", "#3F7A1E", "#1F2B4B", "#FFB547", "#2CC7EA", "#ffffff"], disableForReducedMotion: true })
}

/** Registra la visita del día y celebra insignias, misiones y subidas de nivel (gamiVisit + gamiCheck de la v4). */
export function GamiCheck() {
  const bookId = useBookId()
  const { user } = useApp()
  const canEdit = useCanEdit()
  const router = useRouter()
  const qc = useQueryClient()
  const g = useGami()
  const visited = useRef("")
  const running = useRef(false)

  useEffect(() => {
    const key = `${bookId}:${todayBogota()}`
    if (visited.current === key) return
    visited.current = key
    const t = setTimeout(async () => {
      // V7-H2: POST /v1/books/:b/gami/visit con el interruptor `gami` (apagado: Supabase, rama heredada).
      if (apiOn("gami")) {
        const { browserApi } = await import("@/lib/api/client")
        await browserApi().gami.visit({ params: { bookId }, query: {} }).catch(() => undefined)
      } else await gamiVisitLegacy(bookId, user.id, todayBogota())
      qc.invalidateQueries({ queryKey: qk(bookId, "gami") })
    }, 1200)
    return () => clearTimeout(t)
  }, [bookId, user.id, qc])

  const sig = g ? `${g.X.total}|${Object.keys(g.st.unl).length}|${g.M.map((m) => m.p).join(",")}` : ""
  useEffect(() => {
    if (!g || !g.st.on || running.current) return
    const { badges, missions } = gamiPending(g.G, g.today)
    const first = !g.st.init
    const subio = g.L.n > g.st.maxLevel
    if (!badges.length && !missions.length && !subio && !first) return
    running.current = true
    const t = setTimeout(async () => {
      // V7-H2: con `gami` encendido la API evalúa y guarda (POST …/gami/check: insignias, misiones, nivel y campana) y
      // dice qué celebrar; apagado, lo de siempre desde el navegador (rama heredada).
      let cel = { first, badges: badges as { id: string; n: string; d: string }[], missions: missions as { k: string; t: string; xp: number }[], nivel: subio ? { n: g.L.n, name: g.L.name } : null }
      if (apiOn("gami")) {
        try {
          const { browserApi, unwrapData } = await import("@/lib/api/client")
          const r = unwrapData(await browserApi().gami.check({ params: { bookId }, query: {} }))
          cel = { first: r.first, badges: r.badges, missions: r.missions, nivel: r.nivel }
          if (!r.first && (r.badges.length || r.nivel)) qc.invalidateQueries({ queryKey: ["notifications"] })
        } catch {
          cel = { first: true, badges: [], missions: [], nivel: null }
        }
      } else {
        await gamiCheckLegacy({ bookId, today: g.today, badges, missions, first, subio, canEdit, maxLevel: Math.max(g.st.maxLevel, g.L.n), init: g.st.init ?? g.today })
        // Insignias y nivel también quedan en la campana (kind "logro", sin duplicados).
        if (!first && (badges.length || subio)) void logroNotifs({ bookId, badges: badges.map((b) => ({ id: b.id, n: b.n, d: b.d })), nivel: subio ? { n: g.L.n, name: g.L.name } : null }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))
      }
      qc.invalidateQueries({ queryKey: qk(bookId, "gami") })
      running.current = false
      if (cel.first) return // la primera evaluación no celebra lo que ya estaba cumplido
      cel.missions.forEach((m) => toast.success("Misión cumplida", { description: `+${m.xp} puntos · ${m.t}` }))
      cel.badges.slice(0, 3).forEach((b, i) => setTimeout(() => { toast.success(`Insignia: ${b.n}`, { description: b.d, action: { label: "Ver logros", onClick: () => router.push("/logros") } }); confetti() }, i * 900))
      const nv = cel.nivel
      if (nv) setTimeout(() => { toast.success("¡Subiste de nivel!", { description: `Ahora eres nivel ${nv.n}: ${nv.name}. ¡Sigue así!` }); confetti(160) }, Math.min(cel.badges.length, 3) * 900)
    }, 500)
    return () => { clearTimeout(t); running.current = false }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
