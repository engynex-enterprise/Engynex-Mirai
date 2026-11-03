"use client"

import { useEffect } from "react"
import { InstallBanner, InstallDialog } from "./install"
import { NavProgress } from "./nav-progress"
import { PullToRefresh } from "./pull-to-refresh"

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
      <InstallBanner />
      <InstallDialog />
    </>
  )
}
