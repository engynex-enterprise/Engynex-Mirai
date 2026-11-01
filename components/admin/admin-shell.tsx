"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModeSwitch } from "@/components/app/mode-switch"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { AppContextProvider, useApp } from "@/components/app/app-context"
import { ADMIN_NAV, adminPage } from "@/lib/admin-nav"
import { Crumbs } from "@/components/mirai/crumbs"
import type { AppContext } from "@/lib/dal"

function Nav() {
  const path = usePathname()
  const cur = adminPage(path)
  const { user } = useApp()
  const { isMobile, setOpenMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-2 pt-3">
        <ModeSwitch mode="admin" />
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <Link href="/admin" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2" onClick={() => isMobile && setOpenMobile(false)}>
            <IsoIcon k="mirai" size={30} />
            <span className="grid leading-tight group-data-[collapsible=icon]:hidden"><span className="font-bold">Mirai Admin</span><span className="text-xs text-muted-foreground">Consola de la plataforma</span></span>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild><SidebarTrigger className="size-9 shrink-0 rounded-full hover:bg-sidebar-accent max-md:hidden" aria-label="Minimizar o expandir el menú (Ctrl B)" /></TooltipTrigger>
            <TooltipContent side="right">Minimizar o expandir el menú (Ctrl B)</TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {ADMIN_NAV.map((s) => (
          <SidebarGroup key={s.sec} className="py-1">
            <SidebarGroupLabel className="text-[12px] uppercase tracking-wide">{s.sec}</SidebarGroupLabel>
            <SidebarMenu>
              {s.items.map((i) => (
                <SidebarMenuItem key={i.href}>
                  <SidebarMenuButton asChild isActive={cur.href === i.href} tooltip={i.label}>
                    <Link href={i.href} onClick={() => isMobile && setOpenMobile(false)}><Icon name={i.icon} /><span>{i.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-1 pb-3">
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton asChild tooltip="Volver a Mirai"><Link href="/inicio"><ArrowLeft /><span>Volver a Mirai</span></Link></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton tooltip="Tema" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun /> : <Moon />}<span>{resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><div className="flex items-center gap-2 p-2"><UserAvatar src={user.avatar} name={user.nombre} className="size-7" /><span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden"><span className="truncate text-sm font-medium">{user.nombre}</span><span className="truncate text-xs text-muted-foreground">{user.email}</span></span></div></SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** Consola de administración: mismo Mirai, otro menú y otras vistas. */
export function AdminShell({ ctx, children, sidebarOpen = true }: { ctx: AppContext; children: React.ReactNode; sidebarOpen?: boolean }) {
  return (
    <AppContextProvider value={ctx}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <Nav />
        <SidebarInset className="min-w-0 bg-transparent">
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur md:hidden">
            <SidebarTrigger aria-label="Menú de la consola" />
            <span className="font-semibold">Mirai Admin</span>
            <Button size="sm" variant="ghost" className="ml-auto" asChild><Link href="/inicio">Volver a Mirai</Link></Button>
          </div>
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-3 pt-4 pb-16 sm:px-6 lg:px-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </AppContextProvider>
  )
}

/** Encabezado de cada vista de la consola. */
export function AdminHeader({ title, desc, actions, back }: { title?: string; desc?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  const path = usePathname()
  const p = adminPage(path)
  const sec = ADMIN_NAV.find((s) => s.items.some((i) => i.href === p.href))
  const crumbs = [{ label: "Consola", href: "/admin" }, ...(sec && sec.sec !== "General" ? [{ label: sec.sec, href: sec.items[0].href }] : []), ...(back ? [{ label: back.label, href: back.href }] : [])]
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <Crumbs items={path === "/admin" ? [] : crumbs} />
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{title ?? p.label}</h1>
        <p className="text-muted-foreground">{desc ?? p.desc}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
