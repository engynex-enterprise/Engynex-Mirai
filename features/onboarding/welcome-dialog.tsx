"use client"

import { usePathname, useRouter } from "next/navigation"
import { Compass, Receipt, ShieldCheck, Users, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { WelcomeArt } from "@/components/mirai/welcome-art"
import { Tip } from "@/components/mirai/tip"
import { useApp } from "@/components/app/app-context"
import { usePrefs } from "@/features/settings/prefs"

const PUNTOS = [
  { Icon: Receipt, t: "Lo que entra y lo que sale", d: "Anota gastos e ingresos en segundos y mira cuánto te queda cada quincena." },
  { Icon: Users, t: "Toda tu familia, en un solo lugar", d: "Invita a quien quieras, reparte gastos y lleva préstamos sin enredos." },
  { Icon: ShieldCheck, t: "Tus datos, seguros y privados", d: "Cifrados, nunca los vendemos y puedes ocultar los montos con un toque." },
]

/**
 * Modal de bienvenida (estilo Meta: texto e íconos a la izquierda, ilustración a la derecha). Sale una sola vez por
 * persona, la primera vez que entra a la app; queda marcado en user_preferences.extra.welcome_seen.
 */
export function WelcomeDialog() {
  const { user } = useApp()
  const { prefs, saveQuiet } = usePrefs()
  const router = useRouter()
  const path = usePathname()
  const extra = (prefs?.extra ?? {}) as { welcome_seen?: string }
  const open = !!prefs && !extra.welcome_seen && !path.startsWith("/bienvenida")
  const done = (go?: string) => {
    saveQuiet({ extra: { ...extra, welcome_seen: new Date().toISOString() } })
    if (go) router.push(go)
  }
  const nombre = user.apodo || user.nombre.split(" ")[0]
  return (
    <Dialog open={open} onOpenChange={(o) => !o && done()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[1100px] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1100px]">
        <div className="grid max-h-[calc(100dvh-1.5rem)] overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] md:overflow-hidden">
          <div className="order-2 grid content-center gap-7 px-6 py-8 sm:px-12 md:order-1 md:py-14 md:pl-16">
            <div className="grid gap-2">
              <DialogTitle className="text-[26px] leading-tight font-bold tracking-tight text-meta-text sm:text-[30px]">Bienvenido a Mirai{nombre && nombre !== "Tú" ? `, ${nombre}` : ""}</DialogTitle>
              <DialogDescription className="text-[17px] leading-relaxed text-meta-text/90">Tu plata en orden, explicada en palabras simples. Esto es lo que puedes hacer desde hoy:</DialogDescription>
            </div>
            <ul className="grid gap-6">
              {PUNTOS.map(({ Icon, t, d }) => (
                <li key={t} className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-meta-text"><Icon className="size-6" strokeWidth={1.8} /></span>
                  <div className="grid gap-1">
                    <p className="text-[17px] font-semibold text-meta-text">{t}</p>
                    <p className="text-[15px] leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-12 px-7 text-[16px] max-sm:w-full" onClick={() => done("/puesta")}>Empezar</Button>
              <Button size="lg" variant="ghost" className="h-12 text-[15px] max-sm:w-full" onClick={() => done(`${path}?tour=1`)}><Compass /> Ver el recorrido</Button>
            </div>
          </div>
          <div className="relative order-1 h-56 md:order-2 md:h-auto md:min-h-[640px]">
            <WelcomeArt className="absolute inset-0 size-full" />
            <Tip label="Cerrar" side="left">
              <Button size="icon" variant="outline" aria-label="Cerrar" className="absolute top-4 right-4 size-11 rounded-xl bg-white text-meta-text shadow-sm hover:bg-white" onClick={() => done()}><X className="size-6" /></Button>
            </Tip>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
