import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtShort } from "@/lib/format"

/**
 * Monto con formato COP, cifras tabulares y soporte del modo privado. Abreviado (`short`: "$1,2 M") muestra la cifra
 * completa en un tooltip.
 */
export function Money({ value, currency = "COP", short, sign, className }: { value: number | null | undefined; currency?: string; short?: boolean; sign?: boolean; className?: string }) {
  const v = Number(value ?? 0)
  const full = fmtMoney(v, currency)
  const text = short ? fmtShort(v) : full
  const el = (
    <span data-money className={cn("num whitespace-nowrap", className)} tabIndex={short ? 0 : undefined}>
      {sign && v > 0 ? "+" : ""}{text}
    </span>
  )
  if (!short || text === full) return el
  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent><span data-money className="num">{sign && v > 0 ? "+" : ""}{full}</span></TooltipContent>
    </Tooltip>
  )
}
