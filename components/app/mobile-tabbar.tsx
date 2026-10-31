"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, House, Menu, Plus, Receipt } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useShell } from "./shell-store"

/** Barra inferior en celular: Inicio, Gastos, Agregar, Pagos y Menú. */
export function MobileTabBar() {
  const path = usePathname()
  const { setOpenMobile } = useSidebar()
  const setAdd = useShell((s) => s.setAdd)
  const tab = (href: string, label: string, icon: React.ReactNode) => (
    <Link href={href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", path.startsWith(href) ? "text-brand" : "text-muted-foreground")} aria-current={path.startsWith(href) ? "page" : undefined}>
      {icon}{label}
    </Link>
  )
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden" aria-label="Navegación principal">
      <div className="mx-auto flex max-w-lg items-end">
        {tab("/inicio", "Inicio", <House className="size-5" />)}
        {tab("/gastos", "Gastos", <Receipt className="size-5" />)}
        <button type="button" onClick={() => setAdd(true)} className="-mt-5 flex flex-1 flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground" aria-label="Agregar">
          <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-float"><Plus className="size-6" /></span>
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
