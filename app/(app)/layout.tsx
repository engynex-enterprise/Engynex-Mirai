import { Suspense } from "react"
import { cookies } from "next/headers"
import { getAppContext } from "@/lib/dal"
import { AppShell } from "@/components/app/app-shell"
import { ShellSkeleton } from "@/components/skeletons/shell-skeleton"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  )
}

async function Shell({ children }: { children: React.ReactNode }) {
  const [ctx, store] = await Promise.all([getAppContext(), cookies()])
  const sidebarOpen = store.get("sidebar_state")?.value !== "false"
  return (
    <AppShell ctx={ctx} sidebarOpen={sidebarOpen}>
      {children}
    </AppShell>
  )
}
