"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Bell, ChevronLeft, Search } from "lucide-react"
import { PAGES } from "@/lib/nav"
import { haptic } from "@/lib/pwa/haptics"
import { cn } from "@/lib/utils"
import { useShell } from "./shell-store"

/** Parámetros que abren una vista de detalle dentro de la sección (para mostrar "Atrás"). */
const DETALLE = ["id", "leccion", "nuevo", "mes", "contacto", "cuenta", "tarjeta", "meta"]

/**
 * Barra superior del celular, como en las apps nativas: título de la sección (en iPhone centrado y aparece al
 * desplazarte, como el "título grande" de iOS; en Android a la izquierda, estilo Material), botón Atrás en las vistas de
 * detalle, Buscar y la campana con su número. Solo en pantallas de menos de 768 px.
 */
export function MobileTopBar({ unread }: { unread: number }) {
  const path = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const setSearch = useShell((s) => s.setSearch)
  const setBell = useShell((s) => s.setBell)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 56)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [path])
  const seg = path.split("/")[1] || "inicio"
  const titulo = PAGES.find((p) => p.id === seg)?.label ?? "Mirai"
  const detalle = path.split("/").filter(Boolean).length > 1 || DETALLE.some((k) => params.has(k))
  const atras = () => { haptic("light"); if (history.length > 1) router.back(); else router.push(`/${seg}`) }

  return (
    <header data-scrolled={scrolled || undefined}
      className="mobile-topbar fixed inset-x-0 z-40 flex h-13 items-center gap-1 px-1.5 transition-[background-color,box-shadow] duration-200 data-[scrolled]:bg-glass data-[scrolled]:shadow-[0_1px_0_var(--border)] data-[scrolled]:backdrop-blur-xl md:hidden">
      <div className="flex min-w-11 items-center">
        {detalle && (
          <button type="button" onClick={atras} aria-label="Atrás" className="press flex h-11 items-center gap-0.5 rounded-full pr-2 pl-1 text-[17px] text-link focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <ChevronLeft className="size-7" strokeWidth={2.2} aria-hidden /><span className="topbar-back-label">Atrás</span>
          </button>
        )}
      </div>
      <p className="topbar-title min-w-0 flex-1 truncate font-semibold" aria-hidden={!scrolled || undefined}>{titulo}</p>
      <div className="flex items-center">
        <button type="button" onClick={() => setSearch(true)} aria-label="Buscar" className="press grid size-11 place-items-center rounded-full text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Search className="size-[22px]" aria-hidden />
        </button>
        <button type="button" onClick={() => { haptic("light"); setBell(true) }} aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
          className="press relative grid size-11 place-items-center rounded-full text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Bell className="size-[22px]" aria-hidden />
          {unread > 0 && <span className={cn("absolute top-1.5 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] leading-none font-bold text-white ring-2 ring-background")}>{unread > 99 ? "99+" : unread}</span>}
        </button>
      </div>
    </header>
  )
}
