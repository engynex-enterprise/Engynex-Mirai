import { Check, Lightbulb, Sparkles } from "lucide-react"
import { IsoIcon } from "@/components/mirai/iso-icon"

const PAGOS = [
  { iso: "fijos", t: "Arriendo", f: "vie 15", v: "$1.200.000" },
  { iso: "tarjetas", t: "Tarjeta · corte", f: "lun 18", v: "$286.400" },
  { iso: "suscripciones", t: "Suscripción de música", f: "mié 20", v: "$16.900" },
]
const MENU = ["inicio", "balance", "gastos", "me-deben", "metas", "renta"]

/**
 * Maqueta del producto hecha con HTML (no es una captura): la pantalla de Inicio con valores de ejemplo.
 * Se marca como ilustración para lectores de pantalla.
 */
export function HeroMockup() {
  return (
    <figure className="relative mx-auto w-full max-w-[560px]" role="img" aria-label="Ejemplo ilustrativo de la pantalla de Inicio de Mirai: lo que te queda en la quincena, tus próximos pagos y el chat registrando un gasto">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[40px] bg-brand-gradient opacity-25 blur-3xl dark:opacity-20" />
      <div aria-hidden className="overflow-hidden rounded-2xl border bg-popover shadow-float">
        <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" /><span className="size-2.5 rounded-full bg-[#FEBC2E]" /><span className="size-2.5 rounded-full bg-[#28C840]" />
          <span className="mx-auto truncate rounded-md bg-background/80 px-3 py-0.5 text-[11px] text-muted-foreground">mirai.engynex.com/inicio</span>
        </div>
        <div className="flex">
          <div className="hidden w-12 shrink-0 flex-col items-center gap-2.5 border-r bg-muted/30 py-3 sm:flex">
            <IsoIcon k="mirai" size={24} />
            <span className="h-px w-6 bg-border" />
            {MENU.map((k, i) => <span key={k} className={`grid size-8 place-items-center rounded-lg ${i === 0 ? "bg-accent" : ""}`}><IsoIcon k={k} size={20} /></span>)}
          </div>
          <div className="grid min-w-0 flex-1 gap-3 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Inicio · 1ª quincena</p>
                <p className="truncate text-sm font-semibold">Así va tu plata hoy</p>
              </div>
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">Ejemplo</span>
            </div>
            <div className="rounded-xl bg-hero-gradient p-3.5 text-white">
              <p className="text-[11px] text-white/75">Te queda en esta quincena</p>
              <p className="num text-2xl font-bold tracking-tight">$412.300</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full w-[68%] rounded-full bg-lime" /></div>
              <div className="mt-1.5 flex justify-between text-[10px] text-white/75"><span>Usaste el 68 %</span><span>Faltan 6 días</span></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1.25fr_1fr]">
              <div className="rounded-xl border bg-card p-2.5">
                <p className="mb-1.5 text-[11px] font-semibold">Próximos pagos</p>
                <ul className="grid gap-1.5">
                  {PAGOS.map((x) => (
                    <li key={x.t} className="flex items-center gap-2 text-[11px]">
                      <IsoIcon k={x.iso} size={18} />
                      <span className="min-w-0 flex-1 truncate">{x.t}<span className="block text-[10px] text-muted-foreground">{x.f}</span></span>
                      <span className="num font-semibold">{x.v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-2 rounded-xl border bg-card p-2.5">
                <p className="flex items-center gap-1 text-[11px] font-semibold"><Lightbulb className="size-3.5 text-warning" /> Hallazgo</p>
                <p className="text-[11px] leading-snug text-muted-foreground">Domicilios subió frente al mes pasado. Son tu gasto hormiga más grande.</p>
                <div className="flex h-10 items-end gap-1">
                  {[38, 52, 44, 70, 58, 90].map((h, i) => <span key={i} className={`flex-1 rounded-sm ${i === 5 ? "bg-warning" : "bg-chart-1/40"}`} style={{ height: `${h}%` }} />)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
              <IsoIcon k="metas" size={22} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-[11px]"><span className="font-semibold">Fondo de emergencia</span><span className="num text-muted-foreground">45 %</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-[45%] rounded-full bg-brand" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Chat que registra: flota sobre la maqueta */}
      <div aria-hidden className="absolute -bottom-10 -left-2 w-[230px] rounded-2xl border bg-popover p-3 shadow-float motion-safe:animate-[float_7s_ease-in-out_infinite] sm:-left-10">
        <p className="ml-auto w-fit rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-[11px] text-primary-foreground">gasté 25 mil en mercado</p>
        <div className="mt-2 rounded-xl border bg-card p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Sparkles className="size-3 text-brand" /> Gasto · Mercado</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="num text-sm font-bold">$25.000</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"><Check className="size-3" /> Confirmar</span>
          </div>
        </div>
      </div>
      <div aria-hidden className="absolute -top-4 -right-2 hidden items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-float motion-safe:animate-[float_8s_ease-in-out_-3s_infinite] sm:flex">
        <IsoIcon k="notificaciones" size={22} />
        <span className="text-[11px] leading-tight"><b>Mañana vence el arriendo</b><span className="block text-muted-foreground">Te avisamos por WhatsApp</span></span>
      </div>
    </figure>
  )
}
