"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronRight, ChevronsUpDown, CirclePlus, LogOut, Moon, Plus, Search, Settings, Sun, User } from "lucide-react"
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
import { useGami } from "@/features/gami/use-gami"

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
      <SidebarHeader className="gap-1.5 pt-3">
        <BookSwitcher />
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="search" onClick={() => openSearch(true)} tooltip="Buscar (Ctrl K)" className="h-10 rounded-full bg-secondary px-3 text-muted-foreground hover:bg-secondary-hover group-data-[collapsible=icon]:rounded-full">
              <Search /> <span>Buscar en Mirai</span> <Kbd className="ml-auto bg-card">Ctrl K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="add" onClick={() => openAdd(true)} tooltip="Agregar (N)" className="h-10 justify-center rounded-md bg-primary font-semibold text-primary-foreground shadow-[0_2px_6px_rgba(42,127,20,.3)] hover:bg-primary-hover hover:text-primary-foreground active:bg-primary-hover active:text-primary-foreground group-data-[collapsible=icon]:rounded-full">
              <CirclePlus /> <span className="flex-none">Agregar</span> <Kbd className="ml-auto bg-white/20 text-inherit group-data-[collapsible=icon]:hidden">N</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <ProfileRow />
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="bell" onClick={() => openBell(true)} tooltip="Notificaciones">
              <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-card shadow-card group-data-[collapsible=icon]:size-7"><IsoIcon k="notificaciones" size={22} />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-expense px-1 text-[10px] font-bold text-white ring-2 ring-sidebar">{unread > 9 ? "9+" : unread}</span>}</span>
              <span>Notificaciones</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV.map((s) => (
          <SidebarGroup key={s.sec} className="py-1">
            <SidebarGroupLabel className="text-[13px]">{s.sec}</SidebarGroupLabel>
            <SidebarMenu>
              {s.entries.filter((e) => isGroup(e) || !hidden.includes(e.id)).map((e) =>
                isGroup(e) ? (
                  <Collapsible key={e.g} asChild open={!collapsed && openGroup === e.g} onOpenChange={(o) => setOpenGroup(o ? e.g : null)}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={e.label} isActive={(collapsed || openGroup !== e.g) && e.items.some((i) => i.id === current)}>
                          <NavIcon iso={e.iso} />
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

      <SidebarFooter className="gap-2 pb-3">
        {!collapsed && <LiveBar live={live} online={online} />}
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** Ícono del menú en círculo (estilo accesos de Facebook). */
function NavIcon({ iso, icon }: { iso?: string; icon?: string }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card shadow-card transition-transform group-hover/menu-button:scale-105 group-data-[collapsible=icon]:size-7 group-data-[active=true]/menu-button:bg-white dark:group-data-[active=true]/menu-button:bg-card">
      {iso ? <IsoIcon k={iso} size={22} /> : <Icon name={icon ?? "circle"} className="size-5! text-brand" />}
    </span>
  )
}

/** Primera fila: tu foto y nombre (como en Facebook), lleva a tu perfil. */
function ProfileRow() {
  const { user } = useApp()
  const path = usePathname()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={user.nombre} isActive={path === "/perfil"}>
        <Link href="/perfil">
          <Avatar className="size-9 group-data-[collapsible=icon]:size-7">
            {user.avatar && <AvatarImage src={user.avatar} alt="" />}
            <AvatarFallback className="bg-brand-gradient text-xs font-bold text-white">{initials(user.nombre)}</AvatarFallback>
          </Avatar>
          <span className="font-semibold">{user.nombre}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
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
          {hasIso(item.id) ? <NavIcon iso={item.id} /> : <NavIcon icon={item.icon} />}
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
            <SidebarMenuButton data-tour="book" size="lg" className="data-[state=open]:bg-sidebar-accent" tooltip="Cambiar de libro">
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
  const g = useGami()
  const lvl = g?.st.on ? g.L : null
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton data-tour="user" size="lg" tooltip={user.nombre}>
              <Avatar className="size-8">
                {user.avatar && <AvatarImage src={user.avatar} alt="" />}
                <AvatarFallback className="bg-brand-gradient text-xs text-white">{initials(user.nombre)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{user.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">{lvl ? `Nivel ${lvl.n} · ${lvl.name}` : household.nombre} · {{ owner: "Dueño", editor: "Editor", viewer: "Solo lectura" }[household.role]}</span>
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
