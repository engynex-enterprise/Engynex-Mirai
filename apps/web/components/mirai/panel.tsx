import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"
import { InfoTip } from "./field"

/**
 * Título de sección único para toda la app (17 px, semibold) con ícono opcional, ayuda (i) y una acción a la derecha.
 * Úsalo dentro de tarjetas o encima de una rejilla para que todos los módulos se vean iguales.
 */
export function SectionTitle({ children, icon, info, action, description, as: As = "h2", className }: {
  children: React.ReactNode; icon?: string; info?: string; action?: React.ReactNode; description?: React.ReactNode
  as?: "h2" | "h3"; className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-x-3 gap-y-2", className)}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <As className="flex min-w-0 items-center gap-2 text-[17px] leading-6 font-semibold">
          {icon && <Icon name={icon} className="size-5 shrink-0 text-brand" />}
          <span className="min-w-0 break-words">{children}</span>
          {info && <InfoTip text={info} label={typeof children === "string" ? children : undefined} />}
        </As>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * Tarjeta de contenido estándar (mismo radio, sombra y padding en todos los módulos). Con `title` pinta el encabezado
 * con `SectionTitle`. Ocupa todo el alto de su celda (`h-full`) para que las tarjetas de una misma fila midan lo mismo.
 */
export function Panel({ title, icon, info, description, action, children, className, bodyClassName, as, flush, ...rest }: {
  title?: React.ReactNode; icon?: string; info?: string; description?: React.ReactNode; action?: React.ReactNode
  children?: React.ReactNode; className?: string; bodyClassName?: string; as?: "h2" | "h3"
  /** Sin padding en el cuerpo (listas que llegan al borde). */
  flush?: boolean
} & Omit<React.ComponentProps<"div">, "title">) {
  return (
    <Card className={cn("h-full gap-4 p-5 shadow-card ring-0", flush && "gap-0 p-0", className)} {...rest}>
      {title && <SectionTitle icon={icon} info={info} action={action} description={description} as={as} className={cn(flush && "px-5 pt-5 pb-3")}>{title}</SectionTitle>}
      {children !== undefined && (bodyClassName ? <div className={bodyClassName}>{children}</div> : children)}
    </Card>
  )
}
