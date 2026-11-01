import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { IsoIcon } from "./iso-icon"
import { Illustration } from "./illustration"

/**
 * Estado vacío útil (empty() de la v4): ilustración o isotipo, qué hacer y botón de acción.
 * Con `art` muestra una ilustración (vacio, sin-resultados, todo-al-dia, bienvenida, no-encontrado, error, sin-conexion,
 * sin-avisos); si no, el isotipo de la sección sobre un círculo suave.
 */
export function EmptyState({ iso, art, title, description, action }: { iso?: string; art?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Empty className="appear py-10">
      <EmptyHeader>
        <EmptyMedia>
          {art ? <Illustration k={art} width={200} /> : (
            <span className="bg-soft-gradient grid size-28 place-items-center rounded-full"><IsoIcon k={iso ?? "mirai"} size={72} /></span>
          )}
        </EmptyMedia>
        <EmptyTitle className="text-[17px] font-bold">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-[15px]">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
