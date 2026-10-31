import { Skeleton } from "@/components/ui/skeleton"

export function AuthSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      <div className="grid gap-2"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-4 w-full" />
      <div className="grid gap-4"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
    </div>
  )
}
