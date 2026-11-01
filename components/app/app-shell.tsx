"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useBookRealtime } from "@/hooks/use-realtime"
import type { AppContext } from "@/lib/dal"
import { AppContextProvider, useApp } from "./app-context"
import { AppSidebar } from "./app-sidebar"
import { AddMenu } from "./add-menu"
import { CommandPalette } from "./command-palette"
import { NotificationsSheet, useNotifications } from "./notifications-sheet"
import { HelpSheet } from "./help-sheet"
import { FeedbackDialog } from "@/features/opiniones/feedback-dialog"
import { AdsConsentBanner } from "@/features/ads/ad-slot"
import { MobileTabBar } from "./mobile-tabbar"
import { NewBookDialog } from "./new-book-dialog"
import { useShell } from "./shell-store"
import { applyPrivacy } from "./privacy"
import { useNavBadges } from "./nav-badges"
import { ApplyPrefs } from "@/features/settings/prefs"
import { ChatWidget } from "@/features/chat/chat-widget"
import { Tour } from "./tour"
import { GamiCheck } from "@/features/gami/gami-check"
import { NotifPopups } from "@/features/notify/popups"

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
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-3 pt-4 pb-28 sm:px-6 md:pb-16 lg:px-8">{children}</main>
      </SidebarInset>
      <MobileTabBar />
      <AddMenu />
      <CommandPalette />
      <NotificationsSheet />
      <HelpSheet />
      <FeedbackDialog />
      <AdsConsentBanner />
      <NewBookDialog />
      <ApplyPrefs />
      <ChatWidget />
      <GamiCheck />
      <NotifPopups />
      <Suspense fallback={null}><Tour /></Suspense>
    </>
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
