"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronRight, ChevronsUpDown, CirclePlus, Crown, Download, Eye, EyeOff, LifeBuoy, LogOut, MessageSquareHeart, Moon, Plus, Search, Settings, ShieldCheck, Sun, User } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon, hasIso } from "@/components/mirai/iso-icon"
import { NAV, isGroup, navIdOf, type NavGroup, type NavLeaf } from "@/lib/nav"
import { can, featureOfSection } from "@/lib/plans"
import { cn } from "@/lib/utils"
import { useApp } from "./app-context"
import { ROLE_INFO } from "@/lib/household/roles"
import { useShell } from "./shell-store"
import type { LiveStatus, PresenceUser } from "@/hooks/use-live"
import { switchBook } from "./actions"
import { ModeSwitch } from "./mode-switch"
import { togglePrivacy } from "./privacy"
import { useGami } from "@/features/gami/use-gami"
import { useHydrated } from "@/hooks/use-hydrated"
import { useInstall } from "@/features/pwa/install"

/** Abre el Centro de ayuda desde el menú: en celular primero cierra el menú (dos paneles a la vez bloquean los clics). */
function openHelpFromMenu(isMobile: boolean, setOpenMobile: (v: boolean) => void, openHelp: (k: string) => void) {
  if (isMobile) { setOpenMobile(false); setTimeout(() => openHelp("@"), 250) } else setTimeout(() => openHelp("@"), 0)
}

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?"

const NO_ONLINE: PresenceUser[] = []
const NO_BADGES: Record<string, number | string> = {}

export function AppSidebar(props: { live: LiveStatus; online: PresenceUser[]; badges: Record<string, number | string>; hidden?: string[]; unread: number }) {
  // Hasta terminar de hidratar, lo mismo que pintó el servidor (sin datos): evita el error #418 cuando la API o el tiempo
  // real responden antes de que React hidrate el menú.
  const hydrated = useHydrated()
  const { hidden = [] } = props
  const live: LiveStatus = hydrated ? props.live : "conectando"
  const online = hydrated ? props.online : NO_ONLINE
  const badges = hydrated ? props.badges : NO_BADGES
  const unread = hydrated ? props.unread : 0
  const path = usePathname()
  const current = navIdOf(path.split("/")[1] || "inicio")
  const { plan } = useApp()
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
        <div className="group-data-[collapsible=icon]:hidden"><ModeSwitch mode="usuario" /></div>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:w-full"><BookSwitcher /></div>
          <Tooltip>
            <TooltipTrigger asChild><SidebarTrigger className="size-9 shrink-0 rounded-full hover:bg-sidebar-accent max-md:hidden" aria-label="Contraer o expandir el menú (Ctrl B)" /></TooltipTrigger>
            <TooltipContent side="right">Contraer o expandir el menú (Ctrl B)</TooltipContent>
          </Tooltip>
        </div>
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem className="flex items-center gap-1.5 group-data-[collapsible=icon]:flex-col">
            <SidebarMenuButton data-tour="search" data-rail="pill" onClick={() => openSearch(true)} tooltip="Buscar (Ctrl K)" className="h-10 flex-1 rounded-full bg-secondary px-3 text-muted-foreground hover:bg-secondary-hover group-data-[collapsible=icon]:rounded-full">
              <Search /> <span className="group-data-[collapsible=icon]:sr-only">Buscar en Mirai</span> <Kbd className="ml-auto bg-card group-data-[collapsible=icon]:hidden">Ctrl K</Kbd>
            </SidebarMenuButton>
            <PrivacyButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="add" data-rail="add" onClick={() => openAdd(true)} tooltip="Agregar (N)" className="h-10 justify-center rounded-md bg-primary font-semibold text-primary-foreground shadow-[0_2px_6px_rgba(42,127,20,.3)] hover:bg-primary-hover hover:text-primary-foreground active:bg-primary-hover active:text-primary-foreground group-data-[collapsible=icon]:rounded-full">
              <CirclePlus /> <span className="flex-none group-data-[collapsible=icon]:sr-only">Agregar</span> <Kbd className="ml-auto bg-white/20 text-inherit group-data-[collapsible=icon]:hidden">N</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="bell" onClick={() => openBell(true)} tooltip="Notificaciones">
              <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-card shadow-card"><IsoIcon k="notificaciones" size={22} />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-expense px-1 text-[10px] font-bold text-white ring-2 ring-sidebar">{unread > 9 ? "9+" : unread}</span>}</span>
              <span>Notificaciones</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV.map((s, si) => (
          <SidebarGroup key={s.sec} className="py-1">
            {si > 0 && <span aria-hidden className="mx-auto mb-1 hidden h-px w-8 bg-sidebar-border group-data-[collapsible=icon]:block" />}
            <SidebarGroupLabel className="text-[13px]">{s.sec}</SidebarGroupLabel>
            <SidebarMenu>
              {s.entries.filter((e) => isGroup(e) || !hidden.includes(e.id)).map((e) =>
                isGroup(e) && collapsed ? (
                  <GroupFlyout key={e.g} group={e} current={current} badges={badges} badge={groupBadge(e)} />
                ) : isGroup(e) ? (
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
                                  {!can(plan, featureOfSection(i.id)) && <PremiumMark />}
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

/** Ícono del menú en círculo (estilo accesos de Facebook). Con el menú plegado lleva el número de pendientes encima. */
function NavIcon({ iso, icon, badge }: { iso?: string; icon?: string; badge?: number | string }) {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-card shadow-card transition-transform group-hover/menu-button:scale-105 group-data-[active=true]/menu-button:bg-white dark:group-data-[active=true]/menu-button:bg-card">
      {iso ? <IsoIcon k={iso} size={22} /> : <Icon name={icon ?? "circle"} className="size-5! text-brand" />}
      {badge !== undefined && badge !== 0 && (
        <span className={cn("absolute -top-1 -right-1 hidden h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-bold ring-2 ring-sidebar group-data-[collapsible=icon]:grid", typeof badge === "number" ? "bg-expense text-white" : "bg-lime text-navy")}>
          {typeof badge === "number" ? (badge > 9 ? "9+" : badge) : "•"}
        </span>
      )}
    </span>
  )
}

/** Menú plegado: un grupo (Mi dinero, Préstamos…) abre sus secciones en un menú flotante a la derecha, como Facebook. */
function GroupFlyout({ group, current, badges, badge }: { group: NavGroup; current: string; badges: Record<string, number | string>; badge: number }) {
  const { plan } = useApp()
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={group.label} isActive={group.items.some((i) => i.id === current)}>
            <NavIcon iso={group.iso} badge={badge || undefined} />
            <span>{group.label}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="min-w-60 rounded-xl p-1.5">
          <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-[13px] font-semibold"><IsoIcon k={group.iso} size={20} />{group.label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {group.items.map((i) => (
            <DropdownMenuItem key={i.id} asChild className={cn("h-10 rounded-lg px-2.5 text-[14px]", i.id === current && "bg-nav-active font-semibold text-nav-active-foreground")}>
              <Link href={i.href} prefetch aria-current={i.id === current ? "page" : undefined}>
                <span className="flex-1 truncate">{i.label}</span>
                {!can(plan, featureOfSection(i.id)) && <PremiumMark />}
                {badges[i.id] !== undefined && <NavBadge v={badges[i.id]} />}
                {i.id === current && <Check className="size-4 text-brand" />}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

/** Ojo para ocultar o mostrar los montos (modo privado). */
function PrivacyButton() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const read = () => setOn(document.documentElement.classList.contains("priv"))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [])
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={togglePrivacy} aria-label="Ocultar o mostrar montos" aria-pressed={on}
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground hover:bg-secondary-hover">
          {on ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{on ? "Mostrar montos" : "Ocultar montos"}</TooltipContent>
    </Tooltip>
  )
}

function NavBadge({ v }: { v: number | string }) {
  return (
    <span className={cn("ml-auto rounded-full px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums", typeof v === "number" ? "bg-expense text-white" : "bg-lime text-navy")}>
      {typeof v === "number" && v > 9 ? "9+" : v}
    </span>
  )
}

/** Corona junto a las secciones Premium cuando el hogar está en el plan gratis. */
function PremiumMark() {
  return <Crown className="ml-auto size-3.5! shrink-0 text-amber-500" aria-label="Premium" />
}

function Leaf({ item, active, badge }: { item: NavLeaf; active: boolean; badge?: number | string }) {
  const { plan } = useApp()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href} prefetch>
          {hasIso(item.id) ? <NavIcon iso={item.id} badge={badge} /> : <NavIcon icon={item.icon} badge={badge} />}
          <span>{item.label}</span>
          {!can(plan, featureOfSection(item.id)) && <PremiumMark />}
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
                <UserAvatar src={o.avatar} name={o.nombre} className="size-5 ring-2 ring-sidebar" fallbackClassName="text-[9px]" />
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
  const { user, household, isAdmin } = useApp()
  const openFeedback = useShell((s) => s.openFeedback)
  const openHelp = useShell((s) => s.setHelp)
  const { isMobile, setOpenMobile, state } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const g = useGami()
  const hydrated = useHydrated()
  const lvl = hydrated && g?.st.on ? g.L : null
  const inst = useInstall()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton data-tour="user" size="lg" tooltip={user.nombre}>
              <UserAvatar src={user.avatar} name={user.nombre} className="size-8" fallbackClassName="text-xs" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{user.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">{lvl ? `Nivel ${lvl.n} · ${lvl.name}` : household.nombre} · {ROLE_INFO[household.access].short}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={state === "collapsed" && !isMobile ? "right" : "top"} align={state === "collapsed" && !isMobile ? "end" : "start"} sideOffset={state === "collapsed" ? 12 : 4} className="min-w-60 group-data-[state=expanded]:w-(--radix-dropdown-menu-trigger-width)">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild><Link href="/perfil"><User /> Tu perfil</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/ajustes"><Settings /> Ajustes</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => togglePrivacy()}><EyeOff /> Ocultar o mostrar montos</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openHelpFromMenu(isMobile, setOpenMobile, openHelp)}><LifeBuoy /> Centro de ayuda</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openFeedback()}><MessageSquareHeart /> Danos tu opinión</DropdownMenuItem>
            {inst.can && <DropdownMenuItem onSelect={() => { if (isMobile) setOpenMobile(false); setTimeout(() => void inst.install(), isMobile ? 250 : 0) }}><Download /> Instalar Mirai</DropdownMenuItem>}
            {isAdmin && <DropdownMenuItem asChild><Link href="/admin"><ShieldCheck /> Admin</Link></DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={async (e) => {
                // Cambios hechos sin conexión que aún no salen: se intentan enviar y, si siguen ahí, se pregunta.
                const { flushOutbox, refreshPending, useOffline } = await import("@/lib/offline/outbox")
                await flushOutbox(user.id).catch(() => null)
                await refreshPending()
                const n = useOffline.getState().pending
                if (n && !window.confirm(`Tienes ${n} ${n === 1 ? "cambio" : "cambios"} sin enviar (los hiciste sin conexión). Si sales ahora se pierden. ¿Salir de todos modos?`)) { e.preventDefault(); return }
                await (await import("@/lib/auth/mirai")).signOut()
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
