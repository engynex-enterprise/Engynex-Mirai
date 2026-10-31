import { icons, CircleHelp, type LucideProps } from "lucide-react"

const toPascal = (n: string) => n.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())

/** Ícono Lucide por nombre en kebab-case (igual que ic('nombre') de la v4). */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = (icons as Record<string, React.ComponentType<LucideProps>>)[toPascal(name)] ?? CircleHelp
  return <C aria-hidden {...props} />
}
