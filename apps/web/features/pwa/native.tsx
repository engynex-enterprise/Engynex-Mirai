"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { haptic } from "@/lib/pwa/haptics"

const has = (c: string) => typeof document !== "undefined" && document.documentElement.classList.contains(c)
const openDialogs = () => document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]').length
const editable = (el: Element | null) =>
  !!el && ((el as HTMLElement).isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
    (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes((el as HTMLInputElement).type)))

/** Tablet (768–1199 px): el menú lateral queda en íconos, como en el iPad; al pasar a pantalla grande vuelve a abrirse. */
function useTabletRail() {
  const { setOpen, open } = useSidebar()
  const auto = useRef(false)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => {
    const mq = matchMedia("(min-width: 768px) and (max-width: 1199px)")
    const apply = () => {
      if (mq.matches && openRef.current) { auto.current = true; setOpen(false) }
      else if (!mq.matches && auto.current && innerWidth >= 1200) { auto.current = false; setOpen(true) }
    }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [setOpen])
}

/**
 * Con el teclado en pantalla abierto, <html> lleva `kbd`: se ocultan la barra inferior y el globo del chat. Se decide
 * por el alto visible (el teclado lo achica más de un 20 %) y un campo con el foco; no solo por el foco (un campo que se
 * desmonta no avisa que lo perdió).
 */
function useKeyboardClass() {
  useEffect(() => {
    if (!has("touch")) return
    const h = document.documentElement
    const vv = window.visualViewport
    let alto = Math.max(innerHeight, vv?.height ?? 0)
    const check = () => {
      const v = vv?.height ?? innerHeight
      if (!editable(document.activeElement)) alto = Math.max(alto, innerHeight, v)
      h.classList.toggle("kbd", editable(document.activeElement) && v < alto * 0.8)
    }
    const later = () => setTimeout(check, 150)
    const onRotate = () => { alto = 0; setTimeout(() => { alto = Math.max(innerHeight, vv?.height ?? 0); check() }, 400) }
    vv?.addEventListener("resize", check)
    addEventListener("resize", check)
    document.addEventListener("focusin", later)
    document.addEventListener("focusout", later)
    screen.orientation?.addEventListener?.("change", onRotate)
    return () => {
      vv?.removeEventListener("resize", check); removeEventListener("resize", check)
      document.removeEventListener("focusin", later); document.removeEventListener("focusout", later)
      screen.orientation?.removeEventListener?.("change", onRotate)
      h.classList.remove("kbd")
    }
  }, [])
}

/**
 * App instalada en el celular: el gesto o botón Atrás del sistema cierra la ventana abierta (como en Android) en vez
 * de salir de la página. Al abrirse una ventana se duplica la entrada actual del historial (mismo estado de Next, así
 * su router no navega); Atrás la consume y cierra la ventana con Escape.
 */
function useBackClosesDialogs() {
  useEffect(() => {
    if (!has("standalone") || !has("touch")) return
    let pushed = false, byCode = false, href = ""
    const sync = () => {
      const n = openDialogs()
      if (n > 0 && !pushed) { pushed = true; href = location.href; history.pushState(history.state, "", location.href) }
      else if (n === 0 && pushed) {
        pushed = false
        // Se cerró con un botón: se quita la entrada extra, salvo que la ventana haya cambiado la dirección.
        if (location.href === href) { byCode = true; history.back() }
      }
    }
    const onPop = () => {
      if (byCode) { byCode = false; return }
      if (!pushed) return
      pushed = false
      const t = (document.activeElement as HTMLElement | null) ?? document.body
      t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }))
    }
    const mo = new MutationObserver(() => sync())
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
    addEventListener("popstate", onPop)
    return () => { mo.disconnect(); removeEventListener("popstate", onPop) }
  }, [])
}

/** iPhone/iPad instalado (sin botón Atrás del navegador): deslizar desde el borde izquierdo vuelve atrás. */
function EdgeSwipeBack() {
  const router = useRouter()
  const [dx, setDx] = useState(0)
  useEffect(() => {
    if (!has("standalone") || !has("ios")) return
    let x0 = 0, y0 = 0, on = false, d = 0
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      on = e.touches.length === 1 && t.clientX < 22 && openDialogs() === 0
      x0 = t.clientX; y0 = t.clientY; d = 0
    }
    const move = (e: TouchEvent) => {
      if (!on) return
      const t = e.touches[0]
      if (Math.abs(t.clientY - y0) > 50) { on = false; setDx(0); return }
      d = Math.max(0, t.clientX - x0)
      setDx(d)
    }
    const end = () => {
      if (on && d > 90 && history.length > 1) { haptic("light"); router.back() }
      on = false; d = 0; setDx(0)
    }
    addEventListener("touchstart", start, { passive: true })
    addEventListener("touchmove", move, { passive: true })
    addEventListener("touchend", end)
    addEventListener("touchcancel", end)
    return () => { removeEventListener("touchstart", start); removeEventListener("touchmove", move); removeEventListener("touchend", end); removeEventListener("touchcancel", end) }
  }, [router])
  if (!dx) return null
  const p = Math.min(1, dx / 90)
  return (
    <span aria-hidden className="pointer-events-none fixed top-1/2 left-1 z-[90] grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground shadow-[0_4px_14px_rgba(0,0,0,.2)]"
      style={{ transform: `translate(${Math.min(dx, 90) * 0.6}px, -50%) scale(${0.6 + p * 0.4})`, opacity: p }}>
      <ChevronLeft className="size-6" />
    </span>
  )
}

/** Comportamientos de app nativa en el shell (features/pwa/pwa-shell.tsx). */
export function NativeBehaviors() {
  useTabletRail()
  useKeyboardClass()
  useBackClosesDialogs()
  return <EdgeSwipeBack />
}
