"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { qk } from "@/lib/supabase/tables"
import { gamiPending, todayBogota } from "@/lib/domain"
import { useGami } from "./use-gami"

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
      await createClient().from("gami_visits").upsert({ book_id: bookId, user_id: user.id, dia: todayBogota() }, { onConflict: "book_id,user_id,dia", ignoreDuplicates: true })
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
      const sb = createClient()
      if (badges.length) await sb.from("gami_badges").upsert(badges.map((b) => ({ book_id: bookId, badge: b.id, unlocked_at: g.today })), { onConflict: "book_id,badge", ignoreDuplicates: true })
      if (missions.length) await sb.from("gami_missions").upsert(missions.map((m) => ({ book_id: bookId, semana: m.wk, mision: m.k })), { onConflict: "book_id,semana,mision", ignoreDuplicates: true })
      if (canEdit && (first || subio)) await sb.from("gami_state").upsert({ book_id: bookId, max_level: Math.max(g.st.maxLevel, g.L.n), init_date: g.st.init ?? g.today })
      qc.invalidateQueries({ queryKey: qk(bookId, "gami") })
      running.current = false
      if (first) return // la primera evaluación no celebra lo que ya estaba cumplido
      missions.forEach((m) => toast.success("Misión cumplida", { description: `+${m.xp} puntos · ${m.t}` }))
      badges.slice(0, 3).forEach((b, i) => setTimeout(() => { toast.success(`Insignia: ${b.n}`, { description: b.d, action: { label: "Ver logros", onClick: () => router.push("/logros") } }); confetti() }, i * 900))
      if (subio) setTimeout(() => { toast.success("¡Subiste de nivel!", { description: `Ahora eres nivel ${g.L.n}: ${g.L.name}. ¡Sigue así!` }); confetti(160) }, Math.min(badges.length, 3) * 900)
    }, 500)
    return () => { clearTimeout(t); running.current = false }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
