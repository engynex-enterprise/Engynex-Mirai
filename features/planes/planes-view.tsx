"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Check, CreditCard, Crown, Smartphone, TicketPercent } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { FEATURES, FEATURE_LIST, GRATIS_INCLUYE, ahorroAnual, precio, type PremiumFeature } from "@/lib/plans"
import { cn } from "@/lib/utils"
import { paymentOptions, previewCoupon, startCheckout } from "./actions"
import { PremiumBadge, usePlans, type PlanRow } from "./premium"

/** Botones de pago: tarjeta con renovación automática (Mercado Pago) o pago único (Wompi). */
export function CheckoutButtons({ plan, periodo, cupon }: { plan: string; periodo: "mes" | "anio"; cupon?: string }) {
  const { household } = useApp()
  const { data: opts } = useQuery({ queryKey: ["pay-options"], queryFn: () => paymentOptions(), staleTime: Infinity })
  const [busy, setBusy] = useState<string | null>(null)
  const go = async (p: "mercadopago" | "wompi") => {
    setBusy(p)
    const r = await startCheckout(p, periodo, plan, cupon)
    if (r.ok && r.url) { location.href = r.url; return }
    setBusy(null)
    toast.error("No pudimos abrir el pago", { description: r.msg })
  }
  if (household.role !== "owner") return <p className="text-sm text-muted-foreground">Solo el dueño del hogar puede pagar el plan. Pídele que lo active: así lo tienen todos.</p>
  const none = opts && !opts.mercadopago && !opts.wompi
  return (
    <div className="grid gap-2">
      <Button size="lg" disabled={!opts?.mercadopago || !!busy} onClick={() => go("mercadopago")}>{busy === "mercadopago" ? <Spinner /> : <CreditCard />} Pagar con tarjeta{periodo === "mes" ? " (cada mes)" : " (cada año)"}</Button>
      <Button size="lg" variant="outline" disabled={!opts?.wompi || !!busy} onClick={() => go("wompi")}>{busy === "wompi" ? <Spinner /> : <Smartphone />} Pagar con Nequi, PSE o Bancolombia</Button>
      <p className="text-xs text-muted-foreground">
        {none ? "Muy pronto podrás pagar aquí. Estamos terminando de conectar los pagos." : "Pagos procesados por Mercado Pago y Wompi (Bancolombia). Mirai nunca ve ni guarda los datos de tu tarjeta. Puedes cancelar cuando quieras."}
      </p>
    </div>
  )
}

function Incluye({ p }: { p: PlanRow }) {
  const free = !p.precio_mes
  return (
    <ul className="grid gap-2">
      {free && GRATIS_INCLUYE.map((t) => <li key={t} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t}</li>)}
      {!free && <li className="text-sm font-medium">Todo lo de Gratis{p.anuncios ? "" : ", sin anuncios"}, y además:</li>}
      {FEATURE_LIST.filter((f) => p.funciones.includes(f)).map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm"><Icon name={FEATURES[f].icon} className="mt-0.5 size-4 shrink-0 text-amber-600" /><span><b>{FEATURES[f].label}.</b> {FEATURES[f].beneficios.slice(0, 2).join(" · ")}</span></li>
      ))}
      <li className="flex items-start gap-2 text-sm text-muted-foreground"><Icon name="info" className="mt-0.5 size-4 shrink-0" />{p.limites.libros ? `${p.limites.libros} libro${p.limites.libros === 1 ? "" : "s"} de cuentas` : "Libros de cuentas ilimitados"} · {p.limites.personas ? `hasta ${p.limites.personas} personas` : "personas ilimitadas"} por hogar</li>
      {p.anuncios && <li className="flex items-start gap-2 text-sm text-muted-foreground"><Icon name="megaphone" className="mt-0.5 size-4 shrink-0" />Con anuncios</li>}
    </ul>
  )
}

export function PlanesView() {
  const { plan } = useApp()
  const params = useSearchParams()
  const focus = params.get("f") as PremiumFeature | null
  const { data, isPending } = usePlans()
  const [periodo, setPeriodo] = useState<"mes" | "anio">("anio")
  const [code, setCode] = useState("")
  const [cupon, setCupon] = useState<{ code: string; plan: string; monto: number; msg: string } | null>(null)
  const list = data?.list ?? []
  const maxAhorro = Math.max(0, ...list.filter((p) => p.precio_mes).map((p) => ahorroAnual(p.precio_mes, p.precio_anio).meses))
  const tryCoupon = async (p: PlanRow) => {
    const r = await previewCoupon(code, p.id, periodo)
    if (!r.ok) { setCupon(null); return toast.error(r.msg) }
    setCupon({ code: code.trim().toUpperCase(), plan: p.id, monto: r.monto!, msg: r.msg }); toast.success(r.msg)
  }
  return (
    <div className="grid gap-6">
      <PageHeader id="planes" title="Planes de Mirai" description="Lo básico es gratis para siempre. Los planes de pago agregan la IA, la automatización con tu banco, los impuestos y toda la familia." />
      <div className="flex justify-center">
        <Segmented value={periodo} onChange={(v) => { setPeriodo(v as "mes" | "anio"); setCupon(null) }} items={[{ value: "mes", label: "Mensual" }, { value: "anio", label: maxAhorro ? `Anual · hasta ${maxAhorro} meses gratis` : "Anual" }]} />
      </div>
      {isPending ? <Skeleton className="h-96" /> : (
        <div className={cn("grid items-start gap-5", list.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
          {list.map((p) => {
            const actual = plan.id === p.id
            const precioBase = periodo === "anio" ? p.precio_anio : p.precio_mes
            const ahorro = ahorroAnual(p.precio_mes, p.precio_anio)
            const conCupon = cupon?.plan === p.id ? cupon : null
            const resaltar = p.destacado || (focus && p.funciones.includes(focus))
            return (
              <Card key={p.id} className={cn("gap-4 p-6 shadow-card", resaltar ? "ring-2 ring-amber-400" : "ring-0")} data-testid={`plan-${p.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-xl font-semibold">{p.precio_mes > 0 && <Crown className="size-5 text-amber-500" />}{p.nombre}</h2>
                  {actual ? <StatusPill tone="pagado">Tu plan actual</StatusPill> : p.destacado ? <PremiumBadge label="Recomendado" /> : null}
                </div>
                {p.descripcion && <p className="text-sm text-muted-foreground">{p.descripcion}</p>}
                <div>
                  {p.precio_mes ? (
                    <>
                      <p className="text-3xl font-bold">{conCupon ? <><span className="mr-2 text-lg text-muted-foreground line-through">{precio(precioBase)}</span>{precio(conCupon.monto)}</> : precio(precioBase)} <span className="text-base font-normal text-muted-foreground">{periodo === "anio" ? "al año" : "al mes"}</span></p>
                      <p className="text-sm text-muted-foreground">{periodo === "anio" && ahorro.pesos > 0 ? `Equivale a ${precio(p.precio_anio / 12)} al mes: ahorras ${precio(ahorro.pesos)}.` : "Para todo tu hogar."}</p>
                    </>
                  ) : <p className="text-3xl font-bold">$0 <span className="text-base font-normal text-muted-foreground">para siempre</span></p>}
                </div>
                <Incluye p={p} />
                {p.precio_mes > 0 && !actual && (
                  <>
                    <div className="flex gap-2">
                      <div className="relative flex-1"><TicketPercent className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input className="h-10 pl-9 uppercase" placeholder="¿Tienes un cupón?" value={code} onChange={(e) => setCode(e.target.value)} aria-label={`Cupón para ${p.nombre}`} /></div>
                      <Button variant="outline" className="h-10" disabled={!code.trim()} onClick={() => tryCoupon(p)}>Aplicar</Button>
                    </div>
                    <CheckoutButtons plan={p.id} periodo={periodo} cupon={conCupon?.code} />
                  </>
                )}
                {actual && p.precio_mes > 0 && <p className="rounded-lg bg-brand-soft p-3 text-sm">Revisa tu plan y tus pagos en <Link className="font-semibold text-link underline" href="/ajustes?tab=plan">Ajustes › Mi plan</Link>.</p>}
              </Card>
            )
          })}
        </div>
      )}
      <Card className="gap-2 p-5 text-sm shadow-card ring-0">
        <h2 className="font-semibold">Preguntas rápidas</h2>
        <p><b>¿Puedo cancelar?</b> Sí, cuando quieras desde Ajustes › Mi plan. Sigues con tu plan hasta que termine lo que pagaste.</p>
        <p><b>¿Qué pasa con mis datos si vuelvo a Gratis?</b> No se borra nada. Las funciones de pago se pausan y tus libros extra quedan guardados.</p>
        <p><b>¿Hay derecho de retracto?</b> Sí: puedes pedir la devolución dentro de los 5 días hábiles siguientes al pago (Ley 1480), escribiéndonos desde Tu opinión.</p>
        <p><b>¿Me dan factura?</b> Sí, te llega la factura electrónica al correo de tu cuenta.</p>
      </Card>
    </div>
  )
}
