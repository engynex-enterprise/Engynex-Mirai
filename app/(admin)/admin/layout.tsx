import { Suspense } from "react"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { getAppContext } from "@/lib/dal"
import { AdminShell } from "@/components/admin/admin-shell"
import { ShellSkeleton } from "@/components/skeletons/shell-skeleton"

export const metadata = { title: { default: "Consola", template: "%s · Mirai Admin" } }

/** Solo administradores de la plataforma; para el resto la consola no existe. */
async function Gate({ children }: { children: React.ReactNode }) {
  const [ctx, store] = await Promise.all([getAppContext(), cookies()])
  if (!ctx.isAdmin) notFound()
  return <AdminShell ctx={ctx} sidebarOpen={store.get("sidebar_state")?.value !== "false"}>{children}</AdminShell>
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ShellSkeleton />}><Gate>{children}</Gate></Suspense>
}
