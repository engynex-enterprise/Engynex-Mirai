"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useQueryClient } from "@tanstack/react-query"
import { Bell, Check, ChevronRight, ChevronsUpDown, CirclePlus, LogOut, Moon, Plus, Search, Settings, Sun, User } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon, hasIso } from "@/components/mirai/iso-icon"
import { NAV, isGroup, type NavGroup, type NavLeaf } from "@/lib/nav"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { useApp } from "./app-context"
import { useShell } from "./shell-store"
import type { LiveStatus, PresenceUser } from "@/hooks/use-realtime"
import { switchBook } from "./actions"

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?"

export function AppSidebar({ live, online, badges, hidden = [], unread }: { live: LiveStatus; online: PresenceUser[]; badges: Record<string, number | string>; hidden?: string[]; unread: number }) {
  const path = usePathname()
  const current = path.split("/")[1] || "inicio"
  const { state, isMobile, setOpenMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const openSearch = useShell((s) => s.setSearch)
  const openAdd = useShell((s) => s.setAdd)
  const openBell = useShell((s) => s.setBell)
  const groupOf = (id: string) => NAV.flatMap((s) => s.entries).find((e) => isGroup(e) && e.items.some((i) => i.id === id)) as NavGroup | undefined
  // Un solo grupo abierto: al navegar se abre el de la página actual (estado derivado, sin efecto).
  const [openGroup, setOpenGroup] = useState<string | null>(groupOf(current)?.g ?? null)
  const [prevPage, setPrevPage] = useState(current)
  if (prevPage !== current) {
    setPrevPage(current)
    setOpenGroup(groupOf(current)?.g ?? null)
  }
  useEffect(() => { if (isMobile) setOpenMobile(false) }, [path, isMobile, setOpenMobile])

  const groupBadge = (g: NavGroup) => g.items.reduce((n, i) => n + (typeof badges[i.id] === "number" ? (badges[i.id] as number) : 0), 0)

  return (
    <Sidebar collapsible="icon" className="border-r-sidebar-border">
      <SidebarHeader className="gap-2 pt-3">
        <BookSwitcher />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => openAdd(true)} tooltip="Agregar (N)" className="h-9 bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:bg-sidebar-primary/90 active:text-sidebar-primary-foreground">
              <CirclePlus /> <span>Agregar</span> <Kbd className="ml-auto bg-white/15 text-inherit">N</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => openSearch(true)} tooltip="Buscar (Ctrl K)" className="h-9 border bg-background text-muted-foreground">
              <Search /> <span>Buscar…</span> <Kbd className="ml-auto">Ctrl K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => openBell(true)} tooltip="Notificaciones">
              <span className="relative"><Bell />{collapsed && unread > 0 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-expense" />}</span>
              <span>Notificaciones</span>
            </SidebarMenuButton>
            {unread > 0 && <SidebarMenuBadge className="bg-expense text-white">{unread > 9 ? "9+" : unread}</SidebarMenuBadge>}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV.map((s) => (
          <SidebarGroup key={s.sec} className="py-1">
            <SidebarGroupLabel>{s.sec}</SidebarGroupLabel>
            <SidebarMenu>
              {s.entries.filter((e) => isGroup(e) || !hidden.includes(e.id)).map((e) =>
                isGroup(e) ? (
                  <Collapsible key={e.g} asChild open={!collapsed && openGroup === e.g} onOpenChange={(o) => setOpenGroup(o ? e.g : null)}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={e.label} isActive={(collapsed || openGroup !== e.g) && e.items.some((i) => i.id === current)}>
                          <IsoIcon k={e.iso} size={20} />
                          <span>{e.label}</span>
                          <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      {openGroup !== e.g && groupBadge(e) > 0 && <SidebarMenuBadge className="mr-5 bg-expense text-white">{groupBadge(e)}</SidebarMenuBadge>}
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {e.items.map((i) => (
                            <SidebarMenuSubItem key={i.id}>
                              <SidebarMenuSubButton asChild isActive={i.id === current} className="data-[active=true]:font-medium">
                                <Link href={i.href} prefetch>
                                  <span>{i.label}</span>
                                  {badges[i.id] !== undefined && <NavBadge v={badges[i.id]} />}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <Leaf key={e.id} item={e} active={e.id === current} badge={badges[e.id]} />
                ),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t pb-3">
        {!collapsed && <LiveBar live={live} online={online} />}
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavBadge({ v }: { v: number | string }) {
  return (
    <span className={cn("ml-auto rounded-full px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums", typeof v === "number" ? "bg-expense text-white" : "bg-lime text-navy")}>
      {typeof v === "number" && v > 9 ? "9+" : v}
    </span>
  )
}

function Leaf({ item, active, badge }: { item: NavLeaf; active: boolean; badge?: number | string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href} prefetch>
          {hasIso(item.id) ? <IsoIcon k={item.id} size={20} /> : <Icon name={item.icon} />}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge !== undefined && <SidebarMenuBadge><NavBadge v={badge} /></SidebarMenuBadge>}
    </SidebarMenuItem>
  )
}

function LiveBar({ live, online }: { live: LiveStatus; online: PresenceUser[] }) {
  const { user } = useApp()
  const others = online.filter((o) => o.id !== user.id)
  const dot = { "en-vivo": "bg-success", conectando: "bg-warning", "sin-conexion": "bg-danger" }[live]
  const text = { "en-vivo": "Sincronizado en vivo", conectando: "Conectando…", "sin-conexion": "Sin conexión: reintentando" }[live]
  return (
    <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", dot, live === "conectando" && "animate-pulse")} aria-hidden />
      <span className="truncate">{text}</span>
      {others.length > 0 && (
        <div className="ml-auto flex -space-x-1.5">
          {others.slice(0, 3).map((o) => (
            <Tooltip key={o.id}>
              <TooltipTrigger asChild>
                <Avatar className="size-5 ring-2 ring-sidebar">
                  {o.avatar && <AvatarImage src={o.avatar} alt="" />}
                  <AvatarFallback className="bg-brand-gradient text-[9px] text-white">{initials(o.nombre)}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{o.nombre} está conectado</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}

function BookSwitcher() {
  const { book, books, households } = useApp()
  const router = useRouter()
  const qc = useQueryClient()
  const addBook = useShell((s) => s.setNewBook)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" tooltip="Cambiar de libro">
              <IsoIcon k="mirai" size={32} />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{book.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">Mirai · Tu futuro financiero</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-64" align="start">
            {households.map((h) => (
              <DropdownMenuGroup key={h.id}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">{h.nombre}</DropdownMenuLabel>
                {books.filter((b) => b.household_id === h.id).map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onSelect={async () => {
                      if (b.id === book.id) return
                      await switchBook(b.id)
                      qc.clear()
                      router.refresh()
                    }}
                  >
                    <Icon name={b.icon} /> {b.nombre}
                    {b.id === book.id && <Check className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => addBook(true)}><Plus /> Nuevo libro (negocio, viaje…)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu() {
  const { user, household } = useApp()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={user.nombre}>
              <Avatar className="size-8">
                {user.avatar && <AvatarImage src={user.avatar} alt="" />}
                <AvatarFallback className="bg-brand-gradient text-xs text-white">{initials(user.nombre)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{user.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">{household.nombre} · {{ owner: "Dueño", editor: "Editor", viewer: "Solo lectura" }[household.role]}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild><Link href="/perfil"><User /> Tu perfil</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/ajustes"><Settings /> Ajustes</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                await createClient().auth.signOut()
                router.replace("/login")
                router.refresh()
              }}
            >
              <LogOut /> Salir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
