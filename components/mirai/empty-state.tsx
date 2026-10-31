import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { IsoIcon } from "./iso-icon"

/** Estado vacío útil: isotipo, qué hacer y botón de acción (empty() de la v4). */
export function EmptyState({ iso, title, description, action }: { iso: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyMedia><IsoIcon k={iso} size={72} /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
