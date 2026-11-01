"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { TOUR } from "@/lib/content/ayuda"
import { usePrefs } from "@/features/settings/prefs"

// Selectores de la v4 → elementos de la v5.
const SEL: Record<string, string[]> = {
  "#side": ['[data-slot="sidebar-inner"]', '[data-sidebar="sidebar"]'], ".sb-brand": ['[data-tour="book"]'], ".sb-search": ['[data-tour="search"]'],
  "#crumbs": ['nav[aria-label="breadcrumb"]'], ".composer": ['[data-tour="quick"]'], ".sb-create": ['[data-tour="add"]', 'button[aria-label="Agregar"]'],
  "#bell": ['[data-tour="bell"]'], ".sb-tog": ['[data-sidebar="trigger"]'], "#asFab": ['button[aria-label="Pregúntale a Mirai"]'], ".sb-user": ['[data-tour="user"]'],
}
function find(sel: string): HTMLElement | null {
  if (sel.includes("help-btn")) return [...document.querySelectorAll<HTMLElement>("#main header button")].find((b) => /Cómo funciona/.test(b.textContent ?? "")) ?? null
  for (const s of SEL[sel] ?? [sel]) {
    const el = document.querySelector<HTMLElement>(s)
    if (el && el.getClientRects().length && el.getBoundingClientRect().width > 0) return el
  }
  return null
}

/** Tour de la plataforma (tourStart de la v4): se abre con ?tour=1 (Ajustes, Manual, bienvenida). */
export function Tour() {
  const params = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const { prefs, save } = usePrefs()
  const [i, setI] = useState<number | null>(null)
  const [box, setBox] = useState<DOMRect | null>(null)
  const steps = TOUR

  useEffect(() => {
    if (params.get("tour") === "1") queueMicrotask(() => setI(0))
  }, [params])
  useEffect(() => {
    if (i === null) return
    let k = i
    while (k < steps.length && !find(steps[k].sel)) k++
    if (k !== i) { queueMicrotask(() => (k >= steps.length ? end() : setI(k))); return }
    const el = find(steps[i].sel)!
    el.scrollIntoView({ block: "nearest" })
    const upd = () => setBox(el.getBoundingClientRect())
    upd(); addEventListener("resize", upd); addEventListener("scroll", upd, true)
    return () => { removeEventListener("resize", upd); removeEventListener("scroll", upd, true) }
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  function end() {
    setI(null); setBox(null)
    if (prefs && !prefs.tour_done) save({ tour_done: true })
    if (params.get("tour")) router.replace(path)
  }
  if (i === null || !box) return null
  const s = steps[i]
  const below = box.bottom + 200 < innerHeight
  const left = Math.min(Math.max(12, box.left), innerWidth - 332)
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Tour de Mirai">
      <div className="pointer-events-none absolute rounded-xl ring-4 ring-lime transition-all" style={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }} />
      <div className="absolute w-80 max-w-[calc(100vw-24px)] rounded-xl bg-card p-4 shadow-2xl" style={{ left, top: below ? box.bottom + 12 : Math.max(12, box.top - 190) }}>
        <p className="text-xs text-muted-foreground">Paso {i + 1} de {steps.length}</p>
        <p className="mt-1 font-semibold">{s.t}</p>
        <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={end}>Saltar</Button>
          <div className="flex-1" />
          {i > 0 && <Button size="sm" variant="outline" onClick={() => setI(i - 1)}>Anterior</Button>}
          <Button size="sm" onClick={() => (i + 1 >= steps.length ? end() : setI(i + 1))}>{i + 1 >= steps.length ? "Terminar" : "Siguiente"}</Button>
        </div>
      </div>
    </div>
  )
}
