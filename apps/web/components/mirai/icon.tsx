import { CircleHelp, type LucideProps } from "lucide-react"
import { ICONS } from "./icon-registry"

/** Ícono Lucide por nombre en kebab-case (igual que ic('nombre') de la v4). Registro: npm run icons. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? CircleHelp
  return <C aria-hidden {...props} />
}
