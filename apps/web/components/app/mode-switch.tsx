"use client"

import Link from "next/link"
import { ShieldCheck, UserRound } from "lucide-react"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useApp } from "./app-context"
import { cn } from "@/lib/utils"

/**
 * Selector de modo arriba del menú lateral (solo administradores): Usuario (la app) o Admin (la consola).
 * Con el menú minimizado se muestra como un botón que cambia al otro modo.
 */
export function ModeSwitch({ mode }: { mode: "usuario" | "admin" }) {
  const { isAdmin } = useApp()
  const { state, isMobile, setOpenMobile } = useSidebar()
  if (!isAdmin) return null
  const close = () => isMobile && setOpenMobile(false)
  if (state === "collapsed" && !isMobile) {
    const other = mode === "admin" ? { href: "/inicio", label: "Cambiar a modo usuario", Icon: UserRound } : { href: "/admin", label: "Cambiar a modo admin", Icon: ShieldCheck }
    return (
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip={other.label}><Link href={other.href} aria-label={other.label}><other.Icon /></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    )
  }
  const opt = (m: "usuario" | "admin", href: string, label: string, Icon: typeof UserRound) => (
    <Link href={href} role="radio" aria-checked={mode === m} onClick={close}
      className={cn("flex h-8 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition", mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="size-4" />{label}
    </Link>
  )
  return (
    <div role="radiogroup" aria-label="Modo" className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
      {opt("usuario", "/inicio", "Usuario", UserRound)}
      {opt("admin", "/admin", "Admin", ShieldCheck)}
    </div>
  )
}
