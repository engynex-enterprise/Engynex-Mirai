"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { navIdOf } from "@/lib/nav"
import { Bell, House, Menu, Plus, Receipt } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useShell } from "./shell-store"

/** Barra inferior en celular: Inicio, Gastos, Agregar, Pagos y Menú. */
export function MobileTabBar() {
  const path = usePathname()
  const { setOpenMobile } = useSidebar()
  const setAdd = useShell((s) => s.setAdd)
  // Gastos también queda activa en /fijos (es una pestaña de Gastos).
  const here = `/${navIdOf(path.split("/")[1] || "inicio")}`
  const tab = (href: string, label: string, icon: React.ReactNode) => (
    <Link href={href} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", here.startsWith(href) ? "text-brand after:absolute after:inset-x-4 after:top-0 after:h-[3px] after:rounded-full after:bg-brand" : "text-muted-foreground")} aria-current={here.startsWith(href) ? "page" : undefined}>
      {icon}{label}
    </Link>
  )
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 bg-glass shadow-[0_-1px_3px_rgba(0,0,0,.08)] backdrop-blur-xl md:hidden" aria-label="Navegación principal">
      <div className="mx-auto flex max-w-lg items-end">
        {tab("/inicio", "Inicio", <House className="size-5" />)}
        {tab("/gastos", "Gastos", <Receipt className="size-5" />)}
        <button type="button" onClick={() => setAdd(true)} className="-mt-5 flex flex-1 flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground" aria-label="Agregar">
          <span className="bg-brand-gradient grid size-13 place-items-center rounded-full text-white shadow-[0_4px_14px_rgba(42,127,20,.45)] ring-4 ring-card"><Plus className="size-7" /></span>
          Agregar
        </button>
        {tab("/recordatorios", "Pagos", <Bell className="size-5" />)}
        <button type="button" onClick={() => setOpenMobile(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
          <Menu className="size-5" />Menú
        </button>
      </div>
    </nav>
  )
}
