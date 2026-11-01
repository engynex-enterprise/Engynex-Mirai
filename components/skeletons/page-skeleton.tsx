import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto genérico de una sección: portada, KPIs y una lista (formas del diseño estilo Meta). */
export function PageSkeleton({ kpis = 4, rows = 6 }: { kpis?: number; rows?: number }) {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Cargando">
      <div className="grid items-center gap-4 rounded-[24px] bg-white/45 p-6 sm:rounded-[28px] md:grid-cols-[minmax(0,1fr)_320px] md:p-9 dark:bg-white/5">
        <div className="grid gap-3">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="hidden h-44 rounded-[20px] md:block" />
      </div>
      {kpis > 0 && (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg bg-card p-5 shadow-card">
              <Skeleton className="size-12 rounded-full" />
              <div className="grid flex-1 gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-28" /></div>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2 rounded-lg bg-card p-4 shadow-card sm:p-5">
        <Skeleton className="mb-1 h-5 w-40" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-11 rounded-full" />
            <div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
