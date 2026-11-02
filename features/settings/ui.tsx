import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/mirai/panel"
import { cn } from "@/lib/utils"

/** Fila de ajuste: título, descripción y control a la derecha (row() de la v4). En celular el control baja. */
export function SettingRow({ title, desc, children, className }: { title: string; desc?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 border-b py-4 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="grid min-w-0 gap-0.5"><p className="font-medium">{title}</p>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}</div>
      <div className="min-w-0 shrink-0 max-sm:[&>div]:w-full!">{children}</div>
    </div>
  )
}

/**
 * Sección de ajustes (ajSec de la v4): la misma tarjeta y el mismo título (`Panel`) que el resto de Mirai.
 * `action` va a la derecha del título (p. ej. "Cómo funciona").
 */
export function SettingSection({ icon, title, desc, action, children, id }: { icon: string; title: string; desc?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <Panel id={id} as="h3" icon={icon} title={title} description={desc} action={action} className="h-auto" bodyClassName="grid min-w-0">
      {children}
    </Panel>
  )
}

/** Pila de secciones de una pestaña (mismo espacio entre tarjetas en todas). */
export function SettingStack({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-6">{children}</div>
}

/** Esqueleto de una pestaña de ajustes: tarjetas con título y filas (misma forma que las secciones). */
export function SettingSkeleton({ sections = 2, rows = 3 }: { sections?: number; rows?: number }) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="grid gap-4 rounded-lg bg-card p-5 shadow-card">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: rows }).map((_, j) => (
            <div key={j} className="flex items-center justify-between gap-4">
              <div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
              <Skeleton className="h-9 w-28 max-sm:hidden" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
