"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PAGE_TABS, navIdOf } from "@/lib/nav"
import { Bell, House, Menu, Plus, Receipt } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useShell } from "./shell-store"
import { haptic } from "@/lib/pwa/haptics"

/** Barra inferior en celular: Inicio, Gastos, Agregar, Pagos y Menú. */
export function MobileTabBar() {
  const path = usePathname()
  const { setOpenMobile } = useSidebar()
  const setAdd = useShell((s) => s.setAdd)
  // Gastos queda activa en sus pestañas (/fijos, /tarjetas, /le-debo…) e Inicio en Dashboard y Balance.
  const id = path.split("/")[1] || "inicio"
  const tabs = PAGE_TABS[id]?.map((t) => t.id) ?? []
  const here = `/${tabs.includes("gastos") ? "gastos" : tabs.includes("inicio") ? "inicio" : navIdOf(id)}`
  // Estilo de cada sistema (app/globals.css › Barra inferior): iPhone con el color de la marca y sin rayita; Android con
  // la píldora detrás del ícono (Material 3); en el navegador, la rayita arriba.
  const tab = (href: string, label: string, icon: React.ReactNode) => {
    const on = here.startsWith(href)
    return (
      <Link href={href} onClick={() => { if (!on) haptic("light") }} data-active={on || undefined}
        className={cn("tabbar-item relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[11px] font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", on ? "text-brand" : "text-muted-foreground")} aria-current={on ? "page" : undefined}>
        <span className="tabbar-icon grid place-items-center">{icon}</span>{label}
      </Link>
    )
  }
  return (
    <nav className="tabbar pb-safe fixed inset-x-0 bottom-0 z-40 bg-glass shadow-[0_-1px_3px_rgba(0,0,0,.08)] backdrop-blur-xl md:hidden" aria-label="Navegación principal">
      <div className="mx-auto flex max-w-lg items-end">
        {tab("/inicio", "Inicio", <House className="size-5" />)}
        {tab("/gastos", "Gastos", <Receipt className="size-5" />)}
        <button type="button" onClick={() => { haptic("light"); setAdd(true) }} className="group -mt-5 flex flex-1 flex-col items-center gap-0.5 rounded-lg text-[11px] font-semibold text-muted-foreground focus-visible:outline-none" aria-label="Agregar" aria-haspopup="dialog">
          <span className="bg-brand-gradient grid size-13 place-items-center rounded-full text-white shadow-[0_4px_14px_rgba(42,127,20,.45)] ring-4 ring-card transition-transform group-active:scale-95 group-focus-visible:ring-ring/60"><Plus className="size-7" /></span>
          Agregar
        </button>
        {tab("/recordatorios", "Pagos", <Bell className="size-5" />)}
        <button type="button" onClick={() => { haptic("light"); setOpenMobile(true) }} className="tabbar-item flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[11px] font-semibold text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-haspopup="dialog">
          <span className="tabbar-icon grid place-items-center"><Menu className="size-5" aria-hidden /></span>Menú
        </button>
      </div>
    </nav>
  )
}
