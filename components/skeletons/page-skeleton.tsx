import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto genérico de una sección: encabezado, KPIs y una tabla. */
export function PageSkeleton({ kpis = 4, rows = 6 }: { kpis?: number; rows?: number }) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      <div className="flex items-start gap-4">
        <Skeleton className="hidden size-[52px] rounded-xl sm:block" />
        <div className="grid flex-1 gap-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-full max-w-lg" /></div>
        <Skeleton className="hidden h-9 w-36 sm:block" />
      </div>
      {kpis > 0 && (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-card p-5 shadow-card">
              <Skeleton className="size-10 rounded-lg" />
              <div className="grid flex-1 gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-28" /></div>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 rounded-lg bg-card p-5 shadow-card">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
