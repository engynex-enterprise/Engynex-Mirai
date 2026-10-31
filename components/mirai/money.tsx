import { cn } from "@/lib/utils"
import { fmtMoney, fmtShort } from "@/lib/format"

/** Monto con formato COP, cifras tabulares y soporte del modo privado. */
export function Money({ value, currency = "COP", short, sign, className }: { value: number | null | undefined; currency?: string; short?: boolean; sign?: boolean; className?: string }) {
  const v = Number(value ?? 0)
  const text = short ? fmtShort(v) : fmtMoney(v, currency)
  return (
    <span data-money className={cn("num whitespace-nowrap", className)}>
      {sign && v > 0 ? "+" : ""}{text}
    </span>
  )
}
