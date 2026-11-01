"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment, useEffect, useMemo } from "react"
import { Eye } from "lucide-react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { pageById } from "@/lib/nav"
import { useBookRealtime } from "@/hooks/use-realtime"
import type { AppContext } from "@/lib/dal"
import { AppContextProvider, useApp } from "./app-context"
import { AppSidebar } from "./app-sidebar"
import { AddMenu } from "./add-menu"
import { CommandPalette } from "./command-palette"
import { NotificationsSheet, useNotifications } from "./notifications-sheet"
import { HelpSheet } from "./help-sheet"
import { MobileTabBar } from "./mobile-tabbar"
import { NewBookDialog } from "./new-book-dialog"
import { useShell } from "./shell-store"
import { applyPrivacy, togglePrivacy } from "./privacy"
import { useNavBadges } from "./nav-badges"
import { ApplyPrefs } from "@/features/settings/prefs"

export function AppShell({ ctx, sidebarOpen, children }: { ctx: AppContext; sidebarOpen: boolean; children: React.ReactNode }) {
  return (
    <AppContextProvider value={ctx}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <ShellInner>{children}</ShellInner>
      </SidebarProvider>
    </AppContextProvider>
  )
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const ctx = useApp()
  const me = useMemo(() => ({ id: ctx.user.id, nombre: ctx.user.nombre, avatar: ctx.user.avatar }), [ctx.user])
  const { status, online } = useBookRealtime(ctx.book.id, me, path)
  const { data: notifs } = useNotifications()
  const unread = notifs?.filter((n) => !n.read_at).length ?? 0
  const { badges, hidden } = useNavBadges()
  useShortcuts()
  useEffect(applyPrivacy, [])

  return (
    <>
      <AppSidebar live={status} online={online} badges={badges} hidden={hidden} unread={unread} />
      <SidebarInset className="min-w-0 bg-background">
        <Crumbs />
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-2 pb-28 sm:px-6 md:pb-16 lg:px-8">{children}</main>
      </SidebarInset>
      <MobileTabBar />
      <AddMenu />
      <CommandPalette />
      <NotificationsSheet />
      <HelpSheet />
      <NewBookDialog />
      <ApplyPrefs />
    </>
  )
}


function Crumbs() {
  const path = usePathname()
  const { book } = useApp()
  const page = pageById(path.split("/")[1] ?? "")
  return (
    <div className="sticky top-0 z-30 flex h-12 items-center gap-2 bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <SidebarTrigger className="-ml-1" aria-label="Contraer o expandir el menú (Ctrl B)" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/inicio">{book.nombre}</Link></BreadcrumbLink></BreadcrumbItem>
          {page && (
            <>
              <BreadcrumbSeparator className="max-md:hidden" />
              <BreadcrumbItem className="max-md:hidden">{page.section}</BreadcrumbItem>
              {page.group && (
                <Fragment>
                  <BreadcrumbSeparator className="max-md:hidden" />
                  <BreadcrumbItem className="max-md:hidden">{page.group.label}</BreadcrumbItem>
                </Fragment>
              )}
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate">{page.label}</BreadcrumbPage></BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={togglePrivacy} aria-label="Ocultar o mostrar montos">
            <Eye />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ocultar o mostrar montos</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Atajos: Ctrl/⌘ K buscar · N agregar (Ctrl/⌘ B lo maneja el sidebar). */
function useShortcuts() {
  const { setSearch, setAdd } = useShell.getState()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearch(true)
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n" && !document.querySelector("[role=dialog]")) {
        e.preventDefault()
        setAdd(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setSearch, setAdd])
}
