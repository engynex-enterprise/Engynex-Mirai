"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Check, CreditCard, Crown, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { FEATURES, FEATURE_LIST, FREE_LIMITS, GRATIS_INCLUYE, ahorroAnual, precio, type PremiumFeature } from "@/lib/plans"
import { cn } from "@/lib/utils"
import { paymentOptions, startCheckout } from "./actions"
import { PremiumBadge, usePlans } from "./premium"

/** Botones de pago: tarjeta con renovación automática (Mercado Pago) o pago único (Wompi). */
export function CheckoutButtons({ periodo }: { periodo: "mes" | "anio" }) {
  const { household } = useApp()
  const { data: opts } = useQuery({ queryKey: ["pay-options"], queryFn: () => paymentOptions(), staleTime: Infinity })
  const [busy, setBusy] = useState<string | null>(null)
  const go = async (p: "mercadopago" | "wompi") => {
    setBusy(p)
    const r = await startCheckout(p, periodo)
    if (r.ok && r.url) { location.href = r.url; return }
    setBusy(null)
    toast.error("No pudimos abrir el pago", { description: r.msg })
  }
  if (household.role !== "owner") return <p className="text-sm text-muted-foreground">Solo el dueño del hogar puede pagar Premium. Pídele que lo active: así lo tienen todos.</p>
  const none = opts && !opts.mercadopago && !opts.wompi
  return (
    <div className="grid gap-2">
      <Button size="lg" disabled={!opts?.mercadopago || !!busy} onClick={() => go("mercadopago")}>{busy === "mercadopago" ? <Spinner /> : <CreditCard />} Pagar con tarjeta{periodo === "mes" ? " (se renueva cada mes)" : " (se renueva cada año)"}</Button>
      <Button size="lg" variant="outline" disabled={!opts?.wompi || !!busy} onClick={() => go("wompi")}>{busy === "wompi" ? <Spinner /> : <Smartphone />} Pagar con Nequi, PSE o Bancolombia</Button>
      <p className="text-xs text-muted-foreground">
        {none ? "Muy pronto podrás pagar aquí. Estamos terminando de conectar los pagos." : "Pagos procesados por Mercado Pago y Wompi (Bancolombia). Mirai nunca ve ni guarda los datos de tu tarjeta. Puedes cancelar cuando quieras."}
      </p>
    </div>
  )
}

export function PlanesView() {
  const { plan } = useApp()
  const params = useSearchParams()
  const focus = params.get("f") as PremiumFeature | null
  const { data: p } = usePlans()
  const [periodo, setPeriodo] = useState<"mes" | "anio">("anio")
  const ahorro = p ? ahorroAnual(p.mes, p.anio) : null
  return (
    <div className="grid gap-6">
      <PageHeader id="planes" title="Planes de Mirai" description="Lo básico es gratis para siempre. Premium te da la IA, la automatización con tu banco, los impuestos y toda la familia, sin anuncios." />
      <div className="flex justify-center">
        <Segmented value={periodo} onChange={(v) => setPeriodo(v as "mes" | "anio")} items={[{ value: "mes", label: "Mensual" }, { value: "anio", label: ahorro ? `Anual · ${ahorro.meses} meses gratis` : "Anual" }]} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="gap-4 p-6 shadow-card ring-0">
          <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-semibold">Gratis</h2>{plan === "gratis" && <StatusPill tone="info">Tu plan actual</StatusPill>}</div>
          <p className="text-3xl font-bold">$0 <span className="text-base font-normal text-muted-foreground">para siempre</span></p>
          <ul className="grid gap-2">
            {GRATIS_INCLUYE.map((t) => <li key={t} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t}</li>)}
            <li className="flex items-start gap-2 text-sm text-muted-foreground"><Icon name="info" className="mt-0.5 size-4 shrink-0" />{FREE_LIMITS.libros} libro de cuentas y hasta {FREE_LIMITS.personas} personas por hogar</li>
            <li className="flex items-start gap-2 text-sm text-muted-foreground"><Icon name="megaphone" className="mt-0.5 size-4 shrink-0" />Con anuncios</li>
          </ul>
        </Card>
        <Card className="gap-4 p-6 shadow-card ring-2 ring-amber-400" data-testid="plan-premium">
          <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xl font-semibold"><Crown className="size-5 text-amber-500" /> Premium</h2>{plan === "premium" ? <StatusPill tone="pagado">Tu plan actual</StatusPill> : <PremiumBadge />}</div>
          <div>
            <p className="text-3xl font-bold">{p ? precio(periodo === "anio" ? p.anio : p.mes) : "…"} <span className="text-base font-normal text-muted-foreground">{periodo === "anio" ? "al año" : "al mes"}</span></p>
            <p className="text-sm text-muted-foreground">{periodo === "anio" && p && ahorro ? `Equivale a ${precio(p.anio / 12)} al mes: ahorras ${precio(ahorro.pesos)}.` : "Para todo tu hogar: lo comparten todos sus integrantes."}</p>
          </div>
          <p className="text-sm font-medium">Todo lo de Gratis, sin anuncios ni límites, y además:</p>
          <ul className="grid gap-3">
            {FEATURE_LIST.map((k) => (
              <li key={k} className={cn("grid gap-1 rounded-lg p-3", focus === k ? "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-400/10" : "bg-secondary/60")}>
                <p className="flex items-center gap-2 font-semibold"><Icon name={FEATURES[k].icon} className="size-4 text-amber-600" />{FEATURES[k].label}</p>
                <ul className="grid gap-1 pl-6">{FEATURES[k].beneficios.map((b) => <li key={b} className="list-disc text-sm text-muted-foreground">{b}</li>)}</ul>
              </li>
            ))}
          </ul>
          {plan === "premium" ? <p className="rounded-lg bg-brand-soft p-3 text-sm">Ya tienes Premium. Revisa tu plan y tus pagos en <Link className="font-semibold text-link underline" href="/ajustes?tab=plan">Ajustes › Mi plan</Link>.</p> : <CheckoutButtons periodo={periodo} />}
        </Card>
      </div>
      <Card className="gap-2 p-5 text-sm shadow-card ring-0">
        <h2 className="font-semibold">Preguntas rápidas</h2>
        <p><b>¿Puedo cancelar?</b> Sí, cuando quieras desde Ajustes › Mi plan. Sigues con Premium hasta que termine lo que pagaste.</p>
        <p><b>¿Qué pasa con mis datos si vuelvo a Gratis?</b> No se borra nada. Las funciones Premium se pausan y tus libros extra quedan guardados.</p>
        <p><b>¿Hay derecho de retracto?</b> Sí: puedes pedir la devolución dentro de los 5 días hábiles siguientes al pago (Ley 1480), escribiéndonos desde Tu opinión.</p>
        <p><b>¿Me dan factura?</b> Sí, te llega la factura electrónica al correo de tu cuenta.</p>
      </Card>
    </div>
  )
}
