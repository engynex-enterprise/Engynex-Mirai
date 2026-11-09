"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Bar, BarChart, XAxis } from "recharts"
import { BellPlus, Copy, Globe, HandCoins, Landmark, Mail, MessageCircle, Pencil, Phone, Receipt } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { Icon } from "@/components/mirai/icon"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import { useCanEdit } from "@/components/app/app-context"
import { useList } from "@/hooks/use-book-data"
import { FFREC, estadoFijo, fijoStatus, fmtNit, fmtSitio, fmtTelefono, loanName, tipoLabel, type FixedExpenseIn } from "@/lib/domain"
import { providerMonthly, type ProviderDebt, type ProviderNext } from "@/lib/domain/proveedor-pagos"
import { fmtDate, fmtMoney, monthName, todayISO } from "@/lib/format"
import { DUE_HINT, DUE_TONE, dueState, dueText } from "@/lib/list-helpers"
import type { Row } from "@/lib/supabase/tables"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useCategories, usePaymentMethods } from "@/features/catalogs/hooks"
import { ExpenseForm } from "@/features/expenses/expense-form"
import { FixedForm, type FixedRow } from "@/features/fixed/fixed-form"
import { PayFixedDialog } from "@/features/fixed/pay-fixed-dialog"
import type { Provider } from "./provider-select"

/** Número colombiano para WhatsApp (57 + celular). */
const waNumber = (t: string) => { const d = t.replace(/\D/g, ""); return d.length === 10 && d.startsWith("3") ? `57${d}` : d }
const copiar = (label: string, value: string) =>
  navigator.clipboard.writeText(value).then(() => toast.success("Copiado", { description: `${label}: ${value}` }), () => toast(value))

/**
 * Detalle del proveedor (se abre al tocar su nombre en Proveedores). Orden de arriba abajo:
 *   1. Encabezado: logo, tipo, estado y contacto con un toque (llamar, WhatsApp, correo, sitio web) + Editar.
 *   2. Cifras: próximo pago, pagado este año, le debes y te debe (cuatro tarjetas iguales).
 *   3. Acciones: pagar el próximo gasto fijo, registrar un gasto, programar un pago y las deudas.
 *   4. Pestañas: Lo enlazado (fijos, suscripciones y préstamos) · Pagos (gráfica de 12 meses y gastos) · Datos.
 * La ventana conserva su contenido mientras se cierra (ResponsiveDialog).
 */
export function ProviderDetail({ provider, next, debt, onOpenChange, onEdit }: {
  provider: Provider | null; next?: ProviderNext; debt?: ProviderDebt; onOpenChange: (o: boolean) => void; onEdit: (p: Provider) => void
}) {
  return (
    <ResponsiveDialog open={!!provider} onOpenChange={onOpenChange} wide title={provider?.nombre ?? "Proveedor"} description={provider ? `${tipoLabel(provider.tipo)} · todo lo que tienes con este proveedor` : undefined}>
      {provider && <Body p={provider} next={next} debt={debt} onEdit={onEdit} />}
    </ResponsiveDialog>
  )
}

function Body({ p, next, debt, onEdit }: { p: Provider; next?: ProviderNext; debt?: ProviderDebt; onEdit: (p: Provider) => void }) {
  const today = todayISO()
  const can = useCanEdit()
  const { data: book } = useBookData()
  const { data: subs = [] } = useList("subscriptions")
  const { data: methods = [] } = usePaymentMethods()
  const { data: cats = [] } = useCategories()
  const [paying, setPaying] = useState<FixedRow | null>(null)
  const [gasto, setGasto] = useState(false)
  const [fijo, setFijo] = useState(false)
  const fixed = useMemo(() => ((book?.fixedExpenses ?? []) as unknown as FixedRow[]).filter((f) => f.provider_id === p.id), [book, p.id])
  const misSubs = subs.filter((s) => s.provider_id === p.id)
  const gastos = useMemo(() => ((book?.expenses ?? []) as unknown as Row<"expenses">[]).filter((g) => g.provider_id === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha)), [book, p.id])
  const loans = ((book?.loans ?? []) as unknown as (Row<"loans"> & { provider_id?: string | null })[]).filter((L) => L.provider_id === p.id)
  const serie = useMemo(() => providerMonthly(gastos, p.id, today), [gastos, p.id, today])
  const anio = gastos.filter((g) => g.fecha.startsWith(today.slice(0, 4))).reduce((a, g) => a + Number(g.valor), 0)
  const medio = methods.find((m) => m.id === p.payment_method_id)
  const categoria = cats.find((c) => c.id === p.category_id)
  // El botón "Pagar" solo para un fijo que toca pagar (vencido, de este mes o dentro del aviso): misma regla que Fijos.
  const nextFijo = fixed.map((f) => ({ f, d: estadoFijo(f as unknown as FixedExpenseIn, today).porPagar })).filter((x) => x.d).sort((a, b) => a.d!.due.localeCompare(b.d!.due))[0]
  const st = next ? dueState(next.fecha, today) : null
  const web = fmtSitio(p.sitio_web)
  const enlazados = fixed.length + misSubs.length + loans.length

  return (
    <div className="grid gap-5">
      {/* 1. Encabezado */}
      <div className="relative isolate flex flex-wrap items-center gap-4 overflow-hidden rounded-xl bg-soft-gradient p-4 ring-1 ring-black/5 dark:ring-white/10">
        <EntityLogo provider={p} size={64} className="shadow-card" />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone="info">{tipoLabel(p.tipo)}</StatusPill>
            <StatusPill tone={p.activo ? "ok" : "gray"} hint={p.activo ? "Le sigues pagando: sale en el selector de proveedores." : "Ya no le pagas: no sale en el selector, pero conservas su historial."}>{p.activo ? "Activo" : "Inactivo"}</StatusPill>
            {debt?.mora && <StatusPill tone="vencido" hint="Hay cuotas de un préstamo con este proveedor cuya fecha ya pasó.">Cuota atrasada</StatusPill>}
          </div>
          {(p.telefono || p.correo || web) ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Contactar al proveedor">
              {p.telefono && <ContactBtn label={`Llamar al ${fmtTelefono(p.telefono)}`} href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} icon={<Phone />} />}
              {p.telefono && <ContactBtn label="Escribir por WhatsApp" href={`https://wa.me/${waNumber(p.telefono)}`} icon={<MessageCircle />} external />}
              {p.correo && <ContactBtn label={`Escribir a ${p.correo.trim().toLowerCase()}`} href={`mailto:${p.correo.trim().toLowerCase()}`} icon={<Mail />} />}
              {web && <ContactBtn label={`Abrir ${web.texto}`} href={web.href} icon={<Globe />} external />}
            </div>
          ) : <p className="text-sm text-muted-foreground">Sin datos de contacto{can ? ": agrégalos con Editar." : "."}</p>}
        </div>
        {can && <Button variant="outline" className="bg-card" onClick={() => onEdit(p)}><Pencil /> Editar</Button>}
      </div>

      {/* 2. Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Próximo pago" icon="calendar-clock" tone={st === "vencido" ? "danger" : st === "hoy" ? "warn" : undefined}
          value={next ? <Money value={next.valor} /> : "—"}
          sub={next && st ? <span className="flex flex-wrap items-center gap-1"><StatusPill tone={DUE_TONE[st]} hint={`${DUE_HINT[st]} ${next.origen === "fijo" ? "Gasto fijo" : "Suscripción"}: ${next.nombre}.`}>{dueText(next.fecha, today)}</StatusPill>{fmtDate(next.fecha)}</span> : "Sin pagos programados"} />
        <Stat label={`Pagado en ${today.slice(0, 4)}`} icon="receipt" value={<Money value={anio} />} sub={`${gastos.filter((g) => g.fecha.startsWith(today.slice(0, 4))).length} pagos este año`} />
        <Stat label="Le debes" icon="landmark" tone={debt?.debes ? "danger" : undefined} value={<Money value={debt?.debes ?? 0} />} sub={debt?.debes ? "Préstamos en Le debo" : "No le debes nada"} />
        <Stat label="Te debe" icon="hand-coins" tone={debt?.teDebe ? "ok" : undefined} value={<Money value={debt?.teDebe ?? 0} />} sub={debt?.teDebe ? "Préstamos en Me deben" : "No te debe nada"} />
      </div>

      {/* 3. Acciones */}
      {can && (
        <div className="grid gap-2 rounded-xl border p-3">
          <div className="flex flex-wrap gap-2">
            {nextFijo && <Button onClick={() => setPaying(nextFijo.f)}><Icon name="circle-check" /> Pagar {nextFijo.f.nombre}</Button>}
            <Button variant="soft" onClick={() => setGasto(true)}><Receipt /> Registrar un gasto</Button>
            <Button variant="outline" onClick={() => setFijo(true)}><BellPlus /> Programar un pago fijo</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Deudas</span>
            <Button size="sm" variant="ghost" asChild><Link href={`/le-debo?nuevo=1&prov=${p.id}`}><Landmark /> Registrar una deuda con este proveedor</Link></Button>
            <Button size="sm" variant="ghost" asChild><Link href={`/me-deben?nuevo=1&prov=${p.id}`}><HandCoins /> Registrar lo que me debe</Link></Button>
          </div>
        </div>
      )}

      {/* 4. Pestañas */}
      <Tabs defaultValue="enlazado" className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="enlazado">Lo enlazado <Count n={enlazados} /></TabsTrigger>
          <TabsTrigger value="pagos">Pagos <Count n={gastos.length} /></TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
        </TabsList>

        <TabsContent value="enlazado" className="grid gap-5">
          {!enlazados && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Este proveedor todavía no tiene gastos fijos, suscripciones ni préstamos enlazados. {can && "Usa «Programar un pago fijo» o «Registrar una deuda»."}</p>}
          {!!fixed.length && <Linked title="Gastos fijos" items={fixed.map((f) => {
            const s = fijoStatus(f as unknown as FixedExpenseIn, today); const d = s.venc[0] ?? s.prox
            return { id: f.id, icon: "house", title: f.nombre, sub: [FFREC[f.frec], d && `próximo ${fmtDate(d.due)}`].filter(Boolean).join(" · "), value: Number(f.valor), href: "/fijos", pill: s.venc.length ? <StatusPill tone="vencido" hint={DUE_HINT.vencido}>vencido</StatusPill> : null }
          })} />}
          {!!misSubs.length && <Linked title="Suscripciones" items={misSubs.map((s) => ({ id: s.id, icon: "repeat", title: s.nombre, sub: [s.ciclo === "anual" ? "Anual" : "Mensual", s.proximo && `próximo cobro ${fmtDate(s.proximo)}`].filter(Boolean).join(" · "), value: Number(s.valor), currency: s.currency, href: "/suscripciones" }))} />}
          {!!loans.length && <Linked title="Préstamos y deudas" items={loans.map((L) => {
            const d = debt?.loans.find((x) => x.id === L.id)
            const pagar = L.kind === "pagar"
            return {
              id: L.id, icon: pagar ? "landmark" : "hand-coins", title: `${pagar ? "Le debes" : "Te debe"}${L.concepto ? ` · ${L.concepto}` : ""}`,
              sub: d?.done ? "Pagado" : d?.next ? `Próxima cuota ${fmtMoney(d.next.valor)} el ${fmtDate(d.next.fecha)}` : loanName(L as never, book?.contacts ?? [], book?.entities ?? []),
              value: d?.saldo ?? 0, href: `/${pagar ? "le-debo" : "me-deben"}?id=${L.id}`,
              pill: d?.mora ? <StatusPill tone="vencido" hint="Tiene cuotas cuya fecha ya pasó sin pago registrado.">atrasado</StatusPill> : d?.done ? <StatusPill tone="pagado" check>pagado</StatusPill> : null,
            }
          })} />}
        </TabsContent>

        <TabsContent value="pagos" className="grid gap-5">
          <section className="grid gap-2">
            <h3 className="font-semibold">Lo que le pagaste en los últimos 12 meses</h3>
            {serie.some((x) => x.valor) ? (
              <ChartContainer config={{ valor: { label: "Pagado", color: "var(--brand)" } }} className="h-44 w-full">
                <BarChart data={serie.map((x) => ({ ...x, l: monthName(+x.mes.slice(5), false) }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtMoney(Number(v))} />} />
                  <Bar dataKey="valor" fill="var(--color-valor)" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Aún no hay gastos registrados con este proveedor.</p>}
          </section>
          {!!gastos.length && <Linked title="Últimos gastos" items={gastos.slice(0, 10).map((g) => ({ id: g.id, icon: "receipt", title: g.descripcion || "Gasto", sub: fmtDate(g.fecha, { long: true }), value: Number(g.valor), href: `/gastos?mes=${g.fecha.slice(0, 7)}` }))} />}
        </TabsContent>

        <TabsContent value="datos">
          <dl className="grid overflow-hidden rounded-xl border sm:grid-cols-2">
            <Dato label="Tipo" value={tipoLabel(p.tipo)} />
            <Dato label="Categoría por defecto" value={categoria?.nombre} icon={categoria?.icon ?? undefined} />
            <Dato label="Medio de pago preferido" value={medio?.nombre} icon={medio?.icon || "wallet"} />
            <Dato label="NIT" value={p.nit ? fmtNit(p.nit) : null} copy={p.nit ?? undefined} mono />
            <Dato label="Contrato o número de cliente" value={p.referencia} copy={p.referencia ?? undefined} mono />
            <Dato label="Teléfono" value={p.telefono ? fmtTelefono(p.telefono) : null} copy={p.telefono ?? undefined} mono />
            <Dato label="Correo" value={p.correo?.trim().toLowerCase()} copy={p.correo?.trim().toLowerCase()} />
            <Dato label="Sitio web" value={web?.texto} href={web?.href} />
            <Dato label="Notas" value={p.notas} wide />
          </dl>
        </TabsContent>
      </Tabs>

      <PayFixedDialog fixed={paying} onOpenChange={(o) => !o && setPaying(null)} onReschedule={() => setPaying(null)} />
      <ExpenseForm open={gasto} onOpenChange={setGasto} preset={{ provider_id: p.id, payment_method_id: p.payment_method_id, category_id: p.category_id, descripcion: p.nombre }} />
      <FixedForm open={fijo} onOpenChange={setFijo} preset={{ nombre: p.nombre, provider_id: p.id, proveedor: p.nombre, payment_method_id: p.payment_method_id, category_id: p.category_id }} />
    </div>
  )
}

/** Botón redondo de contacto (enlace tel:, mailto:, WhatsApp o sitio web) con tooltip. */
function ContactBtn({ label, href, icon, external }: { label: string; href: string; icon: React.ReactNode; external?: boolean }) {
  return (
    <Tip label={label}>
      <Button asChild variant="outline" size="icon" className="size-9 rounded-full bg-card">
        <a href={href} aria-label={label} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{icon}</a>
      </Button>
    </Tip>
  )
}

const Count = ({ n }: { n: number }) => <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{n}</span>

/** Tarjeta de cifra: misma altura en las cuatro, ícono y color según el estado. */
function Stat({ label, icon, value, sub, tone }: { label: string; icon: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" | "warn" | "ok" }) {
  return (
    <div className={cn("grid content-start gap-1 rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10", tone === "danger" ? "bg-danger-soft" : tone === "warn" ? "bg-warning-soft" : tone === "ok" ? "bg-success-soft" : "bg-card")}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon name={icon} className="size-3.5" />{label}</span>
      <span className="text-[18px] leading-6 font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

/** Un dato del proveedor con su etiqueta; con `copy`, botón para copiarlo. */
function Dato({ label, value, copy, href, icon, mono, wide }: { label: string; value?: string | null; copy?: string; href?: string; icon?: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:odd:border-r", wide && "sm:col-span-2 sm:border-r-0")}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn("flex min-w-0 items-center gap-1.5 text-[14.5px] font-medium", !value && "font-normal text-muted-foreground", mono && value && "tabular-nums")}>
          {icon && value && <Icon name={icon} className="size-4 shrink-0 text-muted-foreground" />}
          {value ? (href ? <a href={href} target="_blank" rel="noopener noreferrer" className="truncate text-link hover:underline">{value}</a> : <span className={cn(!wide && "truncate")}>{value}</span>) : "—"}
        </dd>
      </div>
      {copy && value && (
        <Tip label={`Copiar ${label.toLowerCase()}`}>
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 rounded-full text-muted-foreground" aria-label={`Copiar ${label}`} onClick={() => copiar(label, copy)}><Copy /></Button>
        </Tip>
      )}
    </div>
  )
}

type LinkedItem = { id: string; icon: string; title: string; sub?: string | null; value: number; currency?: string; href: string; pill?: React.ReactNode }
function Linked({ title, items }: { title: string; items: LinkedItem[] }) {
  return (
    <section className="grid gap-1">
      <h3 className="flex items-center gap-2 font-semibold">{title}<Count n={items.length} /></h3>
      <ul className="grid divide-y overflow-hidden rounded-xl border">
        {items.map((x) => (
          <li key={x.id}>
            <Link href={x.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover">
              <EntityLogo icon={x.icon} seed={x.title} size={34} />
              <span className="grid min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5 truncate font-medium">{x.title}{x.pill}</span>{x.sub && <span className="truncate text-xs text-muted-foreground">{x.sub}</span>}</span>
              <Money value={x.value} currency={x.currency} className="text-right font-semibold" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
