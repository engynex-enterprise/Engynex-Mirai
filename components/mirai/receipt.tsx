import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { cn } from "@/lib/utils"

/**
 * Piezas del recibo que se arma en vivo a la derecha de los formularios con panel (Agregar ingreso, Registrar deuda):
 * figuras del encabezado, código de barras decorativo, filas con puntos y la tarjeta con zigzag (`receipt-edge`).
 */

/** Figuras vectoriales de fondo del encabezado del recibo (círculos, onda, puntos y destellos de la marca). */
export function ReceiptArt() {
  return (
    <svg aria-hidden viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 -z-10 size-full">
      <defs>
        <pattern id="rcpt-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" className="fill-navy/15 dark:fill-white/15" /></pattern>
        <linearGradient id="rcpt-wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9EDB4E" stopOpacity=".28" /><stop offset="1" stopColor="#1F2B4B" stopOpacity=".06" /></linearGradient>
      </defs>
      <rect width="400" height="190" fill="url(#rcpt-wash)" />
      <circle cx="352" cy="18" r="78" fill="#9EDB4E" fillOpacity=".35" />
      <circle cx="352" cy="18" r="46" fill="none" stroke="#3F7A1E" strokeOpacity=".25" strokeWidth="2" />
      <circle cx="22" cy="168" r="62" className="fill-navy/[.07] dark:fill-white/[.06]" />
      <rect x="250" y="96" width="120" height="70" fill="url(#rcpt-dots)" />
      <rect x="18" y="18" width="84" height="50" fill="url(#rcpt-dots)" />
      <path d="M0 140 C 60 112, 120 168, 190 138 S 320 108, 400 140" fill="none" stroke="#9EDB4E" strokeWidth="3" strokeOpacity=".7" strokeLinecap="round" />
      <path d="M0 154 C 70 128, 130 180, 200 152 S 330 124, 400 156" fill="none" stroke="#3F7A1E" strokeWidth="1.5" strokeOpacity=".25" strokeDasharray="3 6" strokeLinecap="round" />
      <path d="M78 96 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#9EDB4E" />
      <path d="M326 120 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#1F2B4B" fillOpacity=".35" />
      <rect x="300" y="48" width="18" height="18" rx="4" transform="rotate(18 309 57)" fill="none" stroke="#1F2B4B" strokeOpacity=".2" strokeWidth="2" />
    </svg>
  )
}

/** Código de barras decorativo (siempre igual para el mismo texto). */
export function Barcode({ seed }: { seed: string }) {
  let h = 2166136261
  for (const ch of seed || "mirai") h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const bars: { x: number; w: number }[] = []
  let x = 0
  for (let i = 0; i < 46 && x < 220; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const w = 1 + (Math.abs(h) % 3)
    bars.push({ x, w })
    x += w + 1 + (Math.abs(h >> 5) % 3)
  }
  return (
    <div className="grid justify-items-center gap-1" aria-hidden>
      <svg viewBox={`0 0 ${x} 30`} className="h-8 w-48 text-foreground/80" preserveAspectRatio="none">
        {bars.map((b, i) => <rect key={i} x={b.x} width={b.w} height="30" fill="currentColor" />)}
      </svg>
      <span className="text-[10px] tracking-[.3em] text-muted-foreground">MIRAI · {String(Math.abs(h) % 1e8).padStart(8, "0")}</span>
    </div>
  )
}

/** Fila del recibo: etiqueta, puntos y valor (un monto o un texto). */
export function ReceiptRow({ label, value, currency, className }: { label: React.ReactNode; value: number | React.ReactNode; currency?: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-1", className)}>
      <span className="shrink-0">{label}</span>
      <span className="mb-1 min-w-3 flex-1 border-b border-dotted border-foreground/30" aria-hidden />
      {typeof value === "number" ? <Money value={value} currency={currency} className="shrink-0" /> : <span className="min-w-0 shrink text-right">{value}</span>}
    </div>
  )
}

/** Tarjeta del recibo con encabezado (ícono, rótulo, título y subtítulo); el cuerpo va en `children`. */
export function ReceiptCard({ icon, label, title, subtitle, testId, ariaLabel, children }: {
  icon: string; label: string; title: string; subtitle: string; testId?: string; ariaLabel?: string; children: React.ReactNode
}) {
  return (
    <div className="receipt-shadow mx-auto w-full max-w-[360px]">
      <aside className="receipt-edge grid bg-receipt font-receipt text-[13px] leading-5" aria-live="polite" data-testid={testId} aria-label={ariaLabel ?? label}>
        <div className="relative isolate overflow-hidden px-5 pt-9 pb-5 text-center">
          <ReceiptArt />
          <span className="mx-auto grid size-12 -rotate-6 place-items-center rounded-2xl bg-navy text-lime shadow-card"><Icon name={icon} className="size-6" /></span>
          <p className="mt-3 text-[10.5px] font-bold tracking-[.32em] text-muted-foreground uppercase">{label}</p>
          <p className="mt-0.5 truncate text-[17px] font-bold text-foreground">{title}</p>
          <p className="text-[11.5px] leading-4 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="grid gap-3 px-5 pb-10">
          <hr className="border-0 border-t border-dashed border-foreground/30" />
          {children}
        </div>
      </aside>
    </div>
  )
}
