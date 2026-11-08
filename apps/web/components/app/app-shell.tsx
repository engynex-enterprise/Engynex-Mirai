"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useBookLive } from "@/hooks/use-live"
import { useIdlePrefetchBook } from "@/hooks/use-prefetch-book"
import type { AppContext } from "@/lib/dal"
import { AppContextProvider, useApp } from "./app-context"
import { AppSidebar } from "./app-sidebar"
import { AddMenu } from "./add-menu"
import { CommandPalette } from "./command-palette"
import { NotificationsSheet, useNotifications } from "./notifications-sheet"
import { HelpSheet } from "./help-sheet"
import { FeedbackDialog } from "@/features/opiniones/feedback-dialog"
import { AdModal, AdsConsentBanner, AdTicker, AfterActionAd } from "@/features/ads/ad-slot"
import { LegalUpdate } from "@/features/legal/legal-update"
import { PlatformNotice } from "./platform-notice"
import { WelcomeDialog } from "@/features/onboarding/welcome-dialog"
import { MobileTabBar } from "./mobile-tabbar"
import { MobileTopBar } from "./mobile-topbar"
import { NewBookDialog } from "./new-book-dialog"
import { useShell } from "./shell-store"
import { applyPrivacy } from "./privacy"
import { useNavBadges } from "./nav-badges"
import { ApplyPrefs } from "@/features/settings/prefs"
import { ChatWidget } from "@/features/chat/chat-widget"
import { ChatBoundary } from "@/features/chat/chat-boundary"
import { Tour } from "./tour"
import { GamiCheck } from "@/features/gami/gami-check"
import { NotifPopups } from "@/features/notify/popups"
import { AutomationRunner } from "@/features/automations/runner"
import { PwaShell } from "@/features/pwa/pwa-shell"
import { SEARCH_EVENT } from "@/features/pwa/title-bar"

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
  const { status, online } = useBookLive(ctx.book.id, me, path) // gateway de tiempo real de la API
  useIdlePrefetchBook(ctx.book.id)
  const setOnline = useShell((s) => s.setOnline)
  useEffect(() => { setOnline(online.map((o) => ({ id: o.id, nombre: o.nombre, avatar: o.avatar }))) }, [online, setOnline])
  const { data: notifs } = useNotifications()
  const unread = notifs?.filter((n) => !n.read_at).length ?? 0
  const { badges, hidden } = useNavBadges()
  useShortcuts()
  useEffect(applyPrivacy, [])

  return (
    <>
      <AppSidebar live={status} online={online} badges={badges} hidden={hidden} unread={unread} />
      <SidebarInset className="min-w-0 bg-transparent">
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-3 pt-[3.5rem] pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 md:pt-4 md:pb-16 lg:px-8"><AdTicker /><PlatformNotice /><LegalUpdate />{children}</main>
      </SidebarInset>
      <Suspense fallback={null}><MobileTopBar unread={unread} /></Suspense>
      <MobileTabBar />
      <AddMenu />
      <CommandPalette />
      <NotificationsSheet />
      <HelpSheet />
      <FeedbackDialog />
      <AdsConsentBanner />
      <AdModal />
      <AfterActionAd />
      <WelcomeDialog />
      <NewBookDialog />
      <ApplyPrefs />
      <ChatBoundary resetKey={path}><ChatWidget /></ChatBoundary>
      <GamiCheck />
      <NotifPopups />
      <AutomationRunner />
      <PwaShell unread={unread} />
      <Suspense fallback={null}><Tour /></Suspense>
    </>
  )
}


/** ¿Hay una ventana abierta? (no cuenta la que se está cerrando: Radix la deja en el DOM con data-state="closed"). */
const openDialog = () => !!document.querySelector('[role=dialog]:not([data-state="closed"])')

/** Atajos: Ctrl/⌘ K buscar · N agregar · ? Centro de ayuda (Ctrl/⌘ B lo maneja el sidebar). Lista en lib/content/centro-ayuda.ts (ATAJOS). */
function useShortcuts() {
  const { setSearch, setAdd, setHelp } = useShell.getState()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearch(true)
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n" && !openDialog()) {
        e.preventDefault()
        setAdd(true)
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "?" && !openDialog()) {
        e.preventDefault()
        setHelp("@")
      }
    }
    // Botón Buscar de la barra de título de la app instalada en el escritorio (features/pwa/title-bar.tsx).
    const onSearch = () => setSearch(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(SEARCH_EVENT, onSearch)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(SEARCH_EVENT, onSearch) }
  }, [setSearch, setAdd, setHelp])
}
