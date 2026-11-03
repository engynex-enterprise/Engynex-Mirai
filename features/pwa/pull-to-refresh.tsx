"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowDown, RefreshCw } from "lucide-react"
import { haptic } from "@/lib/pwa/haptics"
import { cn } from "@/lib/utils"

const THRESHOLD = 70
const MAX = 120

/** ¿El dedo empezó dentro de algo que se desplaza y no está arriba del todo (una lista, un panel)? */
function insideScrolled(t: EventTarget | null) {
  for (let el = t as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true
    if (el.dataset?.noPull !== undefined) return true
  }
  return false
}

/**
 * Deslizar hacia abajo desde arriba para actualizar, en la app instalada en el celular. El navegador ya no lo hace
 * (globals.css › overscroll-behavior: none quita el rebote y el "recargar" del navegador), así que Mirai lo hace a su
 * manera: vuelve a pedir los datos sin recargar la página.
 */
export function PullToRefresh() {
  const qc = useQueryClient()
  const router = useRouter()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    const html = document.documentElement
    if (!html.classList.contains("standalone") || !matchMedia("(pointer: coarse)").matches) return
    let y0: number | null = null
    let d = 0
    let armed = false
    const start = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || window.scrollY > 0 || document.querySelector("[role=dialog]") || insideScrolled(e.target)) { y0 = null; return }
      y0 = e.touches[0]!.clientY
    }
    const move = (e: TouchEvent) => {
      if (y0 === null) return
      const dy = e.touches[0]!.clientY - y0
      if (dy <= 0 || window.scrollY > 0) { d = 0; setPull(0); return }
      d = Math.min(MAX, dy * 0.5)
      if (d >= THRESHOLD && !armed) { armed = true; haptic("light") } else if (d < THRESHOLD) armed = false
      setPull(d)
    }
    const end = async () => {
      if (y0 === null) return
      y0 = null
      const go = d >= THRESHOLD
      d = 0; armed = false
      setPull(0)
      if (!go) return
      busyRef.current = true; setBusy(true)
      try {
        router.refresh()
        await qc.invalidateQueries()
      } finally {
        busyRef.current = false; setBusy(false)
      }
    }
    addEventListener("touchstart", start, { passive: true })
    addEventListener("touchmove", move, { passive: true })
    addEventListener("touchend", end)
    addEventListener("touchcancel", end)
    return () => {
      removeEventListener("touchstart", start); removeEventListener("touchmove", move)
      removeEventListener("touchend", end); removeEventListener("touchcancel", end)
    }
  }, [qc, router])

  const shown = busy ? THRESHOLD : pull
  if (!shown) return null
  return (
    <div aria-live="polite" className="ptr pointer-events-none fixed inset-x-0 z-[65] flex justify-center" style={{ transform: `translateY(${shown - 44}px)` }}>
      <span className={cn("grid size-10 place-items-center rounded-full bg-popover text-brand shadow-float ring-1 ring-black/5 dark:ring-white/10", !busy && pull < THRESHOLD && "text-muted-foreground")}>
        {busy ? <RefreshCw className="size-5 animate-spin" aria-label="Actualizando" />
          : <ArrowDown className="size-5 transition-transform" style={{ transform: `rotate(${pull >= THRESHOLD ? 180 : 0}deg)` }} aria-label={pull >= THRESHOLD ? "Suelta para actualizar" : "Desliza para actualizar"} />}
      </span>
    </div>
  )
}
