import { Card } from "@/components/ui/card"
import { Icon } from "@/components/mirai/icon"
import { cn } from "@/lib/utils"

/** Fila de ajuste: título, descripción y control a la derecha (row() de la v4). */
export function SettingRow({ title, desc, children, className }: { title: string; desc?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 border-b py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="grid gap-0.5"><p className="font-medium">{title}</p>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Sección de ajustes con ícono (ajSec de la v4). */
export function SettingSection({ icon, title, desc, children }: { icon: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-1 p-5 shadow-card ring-0">
      <div className="mb-2 flex items-center gap-2"><Icon name={icon} className="size-5 text-brand" /><h3 className="font-semibold">{title}</h3></div>
      {desc && <p className="mb-2 text-sm text-muted-foreground">{desc}</p>}
      {children}
    </Card>
  )
}
