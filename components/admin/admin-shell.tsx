"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { AppContextProvider, useApp } from "@/components/app/app-context"
import { ADMIN_NAV, adminPage } from "@/lib/admin-nav"
import type { AppContext } from "@/lib/dal"

function Nav() {
  const path = usePathname()
  const cur = adminPage(path)
  const { user } = useApp()
  const { isMobile, setOpenMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader>
        <Link href="/admin" className="flex items-center gap-2 rounded-lg p-2" onClick={() => isMobile && setOpenMobile(false)}>
          <IsoIcon k="mirai" size={30} />
          <span className="grid leading-tight group-data-[collapsible=icon]:hidden"><span className="font-bold">Mirai Admin</span><span className="text-xs text-muted-foreground">Consola de la plataforma</span></span>
        </Link>
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
    </Sidebar>
  )
}

/** Consola de administración: mismo Mirai, otro menú y otras vistas. */
export function AdminShell({ ctx, children }: { ctx: AppContext; children: React.ReactNode }) {
  return (
    <AppContextProvider value={ctx}>
      <SidebarProvider>
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
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        {back ? <Link href={back.href} className="flex w-fit items-center gap-1 text-sm text-link hover:underline"><ArrowLeft className="size-4" />{back.label}</Link> : <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Icon name={p.icon} className="size-4" />Consola</p>}
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{title ?? p.label}</h1>
        <p className="text-muted-foreground">{desc ?? p.desc}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
