import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "./page-skeleton"

/** Esqueleto del shell completo mientras se lee la sesión y el libro. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Cargando Mirai">
      <aside className="hidden w-[16.75rem] shrink-0 flex-col gap-3 border-r bg-sidebar p-3 md:flex">
        <div className="flex items-center gap-2 p-1"><Skeleton className="size-8 rounded-lg" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-32" /></div></div>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="mt-2 grid gap-2">
          {Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-7" style={{ width: `${60 + ((i * 17) % 35)}%` }} />)}
        </div>
      </aside>
      <div className="flex-1 px-4 pt-14 sm:px-6 lg:px-8"><PageSkeleton /></div>
    </div>
  )
}
