"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Check, PartyPopper, Undo2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { useApp } from "@/components/app/app-context"
import { saveBookSettings } from "@/features/settings/prefs"
import { cn } from "@/lib/utils"
import { useSetupProgress, type SetupState } from "./use-setup"
import { SampleButton } from "./sample-button"

export function SetupView() {
  const { user, book } = useApp()
  const { data, isPending } = useSetupProgress()
  const qc = useQueryClient()
  const router = useRouter()
  const first = user.nombre.split(" ")[0]

  const saveSetup = async (next: SetupState, msg?: string) => {
    await saveBookSettings(book.id, { setup: next }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ["b", book.id] })
    if (msg) toast(msg)
  }

  if (isPending || !data) return <PageSkeleton kpis={0} rows={9} />

  const { steps, done, total, next, setup } = data
  return (
    <div className="grid gap-6">
      <PageHeader id="puesta" noHelp
        title={done === 0 ? `¡Bienvenido a Mirai, ${first}! Organicemos tus finanzas` : `Vas muy bien, ${first}`}
        description="Sigue estos pasos en orden. Cada uno toma un par de minutos y le enseña al libro lo que necesita para avisarte, aconsejarte y mostrarte números exactos.">
        <div className="mt-1 grid w-full max-w-sm gap-2 rounded-2xl bg-white/75 px-4 py-3 text-meta-text backdrop-blur dark:bg-white/10">
          <p className="flex items-baseline gap-2"><span className="text-[26px] font-semibold">{done} de {total}</span><span className="text-[13px] text-meta-text/75">pasos completados</span></p>
          <Progress value={(done / total) * 100} className="h-2 bg-black/10 dark:bg-white/15" />
        </div>
      </PageHeader>

      {next ? (
        <div className="rounded-xl bg-[linear-gradient(135deg,#1F2B4B,#9EDB4E)] p-[1.5px] shadow-card">
        <Card className="flex-col items-start gap-4 rounded-[calc(var(--radius-xl)-1px)] bg-popover p-5 shadow-none ring-0 sm:flex-row sm:items-center">
          <IsoIcon k={next.iso} size={56} />
          <div className="grid flex-1 gap-1">
            <span className="text-xs font-semibold tracking-wide text-link uppercase">Siguiente paso</span>
            <h2 className="text-lg font-semibold">{next.t}</h2>
            <p className="text-sm text-muted-foreground">{next.d}</p>
          </div>
          <Button size="lg" asChild className="w-full sm:w-auto"><Link href={next.href}>{next.btn}</Link></Button>
        </Card>
        </div>
      ) : (
        <Card className="items-center gap-3 p-8 text-center shadow-card ring-0">
          <PartyPopper className="size-12 text-brand" />
          <h2 className="text-xl font-semibold">¡Listo! Tu libro está configurado.</h2>
          <p className="max-w-lg text-muted-foreground">Desde ahora te avisaremos de pagos y te ayudaremos a decidir antes de gastar.</p>
          <Button onClick={async () => { await saveSetup({ ...setup, dismissed: true }); router.push("/inicio") }}>Ir al inicio</Button>
        </Card>
      )}

      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li key={s.k}>
            <Card className="flex-row flex-wrap items-center gap-4 p-4 shadow-card ring-0 sm:flex-nowrap">
              <span className="relative">
                <IsoIcon k={s.iso} size={44} className={cn(s.skipped && "opacity-50 grayscale")} />
                {s.ok && <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-success text-white ring-2 ring-card dark:text-navy"><Check className="size-3" /></span>}
              </span>
              <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="text-muted-foreground">{i + 1}.</span> {s.t}
                  {s.ok && <StatusPill tone="pagado" check>Hecho</StatusPill>}
                  {s.skipped && <StatusPill tone="gray">Omitido</StatusPill>}
                </p>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {s.ok ? (
                  <Button variant="outline" asChild className="flex-1 sm:flex-none"><Link href={s.href}>Agregar más</Link></Button>
                ) : (
                  <>
                    <Button variant={next?.k === s.k ? "default" : "soft"} asChild className="flex-1 sm:flex-none"><Link href={s.href}>{s.btn}</Link></Button>
                    {"skip" in s && (s.skipped ? (
                      <Button variant="ghost" onClick={() => { const skip = { ...setup.skip }; delete skip[s.k]; saveSetup({ ...setup, skip }) }}><Undo2 /> Deshacer</Button>
                    ) : (
                      <Button variant="ghost" onClick={() => saveSetup({ ...setup, skip: { ...setup.skip, [s.k]: true } }, "Paso omitido")}>{s.skip}</Button>
                    ))}
                  </>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Card className="flex-col items-start gap-3 p-5 shadow-card ring-0 sm:flex-row sm:items-center">
        <ToneIcon icon="sparkles" tone="violet" className="max-sm:hidden" />
        <p className="flex-1 text-sm text-muted-foreground">¿Quieres ver primero cómo se ve un libro lleno? Cargamos un ejemplo en un libro aparte, sin tocar tus datos.</p>
        <SampleButton />
        <Button variant="outline" onClick={async () => { await saveSetup({ ...setup, dismissed: true }, "Puedes volver a la guía desde el menú de tu perfil"); router.push("/inicio") }}>Ocultar esta guía</Button>
      </Card>
    </div>
  )
}
