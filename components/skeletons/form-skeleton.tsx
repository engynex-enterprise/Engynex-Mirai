import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto de un formulario mientras cargan sus listas. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="grid gap-5 py-2 sm:grid-cols-2" aria-busy="true" aria-label="Cargando formulario">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="grid gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-11 w-full" /></div>
      ))}
    </div>
  )
}
