"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Barra de carga arriba al cambiar de sección (como las apps nativas y YouTube): arranca al tocar un enlace interno y
 * termina cuando la nueva página aparece. Aparece solo si la navegación tarda más de 120 ms.
 */
export function NavProgress() {
  const path = usePathname()
  const [state, setState] = useState<"idle" | "loading" | "done">("idle")
  const [prev, setPrev] = useState(path)
  const wait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // La página cambió: la barra termina (estado derivado del pathname, sin efecto).
  if (prev !== path) {
    setPrev(path)
    if (state === "loading") setState("done")
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      let u: URL
      try { u = new URL(a.href) } catch { return }
      if (u.origin !== location.origin || u.pathname === location.pathname) return
      clearTimeout(wait.current); clearTimeout(stop.current)
      wait.current = setTimeout(() => setState("loading"), 120)
      // Por si la navegación no termina (sin conexión): se quita sola.
      stop.current = setTimeout(() => setState("idle"), 12_000)
    }
    document.addEventListener("click", onClick)
    return () => { document.removeEventListener("click", onClick); clearTimeout(wait.current); clearTimeout(stop.current) }
  }, [])

  // Si la página cambió antes de los 120 ms, la barra ya no se enciende.
  useEffect(() => { clearTimeout(wait.current); clearTimeout(stop.current) }, [path])

  useEffect(() => {
    if (state !== "done") return
    const t = setTimeout(() => setState("idle"), 350)
    return () => clearTimeout(t)
  }, [state])

  return (
    <div aria-hidden className={cn("nav-progress pointer-events-none fixed inset-x-0 z-[70] h-[3px] overflow-hidden", state === "idle" && "opacity-0")}>
      <div className={cn("h-full origin-left bg-brand-gradient transition-[transform,opacity] ease-out",
        state === "loading" ? "scale-x-[.72] duration-[2500ms]" : state === "done" ? "scale-x-100 opacity-0 duration-300" : "scale-x-0 duration-0")} />
    </div>
  )
}
