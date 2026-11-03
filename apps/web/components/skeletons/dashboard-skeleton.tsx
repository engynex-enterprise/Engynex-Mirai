import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto del Dashboard: portada, dos filas de KPIs y bloques de gráficas. */
export function DashboardSkeleton() {
  const kpis = (n: number) => (
    <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg bg-card p-5 shadow-card">
          <Skeleton className="size-12 rounded-full" />
          <div className="grid flex-1 gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-28" /></div>
        </div>
      ))}
    </div>
  )
  const chart = (h: string) => (
    <div className="grid gap-3 rounded-lg bg-card p-5 shadow-card">
      <Skeleton className="h-5 w-48" />
      <Skeleton className={`${h} w-full rounded-lg`} />
    </div>
  )
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      <div className="grid items-center gap-4 rounded-[24px] bg-white/45 p-6 sm:rounded-[28px] md:grid-cols-[minmax(0,1fr)_320px] md:p-9 dark:bg-white/5">
        <div className="grid gap-3"><Skeleton className="h-6 w-40 rounded-full" /><Skeleton className="h-9 w-72 max-w-full" /><Skeleton className="h-4 w-full max-w-md" /></div>
        <Skeleton className="hidden h-44 rounded-[20px] md:block" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl rounded-full" />
      {kpis(4)}
      {kpis(4)}
      {chart("h-40")}
      {chart("h-64")}
      <div className="grid gap-6 lg:grid-cols-2">{chart("h-48")}{chart("h-48")}</div>
    </div>
  )
}
