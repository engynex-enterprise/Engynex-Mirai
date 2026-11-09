"use client"

import { useEffect } from "react"
import { InstallDialog, InstallPrompt } from "./install"
import { NavProgress } from "./nav-progress"
import { PullToRefresh } from "./pull-to-refresh"
import { OfflineBar, OfflineSync } from "./offline-sync"
import { NativeBehaviors } from "./native"

/** Número de avisos sin leer en el ícono de la app (Android, Windows, macOS y iPhone 16.4+ con Mirai instalado). */
function useAppBadge(unread: number) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (!nav.setAppBadge) return
    ;(unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge?.())?.catch(() => {})
  }, [unread])
}

/** Piezas de app nativa dentro del shell (components/app/app-shell.tsx). */
export function PwaShell({ unread }: { unread: number }) {
  useAppBadge(unread)
  return (
    <>
      <NavProgress />
      <PullToRefresh />
      <OfflineSync />
      <OfflineBar />
      <NativeBehaviors />
      <InstallPrompt />
      <InstallDialog />
    </>
  )
}
