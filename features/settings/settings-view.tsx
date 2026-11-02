"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { parseAsString, useQueryState } from "nuqs"
import { Search, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/mirai/page-header"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { cn } from "@/lib/utils"
import { norm } from "@/lib/domain"
import { GeneralTab, AparienciaTab, PrivacidadTab } from "./tabs/account"

// Cada pestaña se descarga al abrirla: General va en el JS inicial; Seguridad (QR), Uso de IA (recharts),
// Respaldo, Catálogos, etc. ya no pesan en la carga de Ajustes.
const TabLoading = () => <div className="h-72 animate-pulse rounded-xl bg-muted/60" aria-busy="true" aria-label="Cargando" />
const SeguridadTab = dynamic(() => import("./tabs/security").then((m) => m.SeguridadTab), { loading: TabLoading })
const IaTab = dynamic(() => import("./tabs/ia").then((m) => m.IaTab), { loading: TabLoading })
const AiUsageView = dynamic(() => import("@/features/ia-uso/uso-view").then((m) => m.AiUsageView), { loading: TabLoading })
const AlertasTab = dynamic(() => import("./tabs/alerts").then((m) => m.AlertasTab), { loading: TabLoading })
const FinanzasTab = dynamic(() => import("./tabs/finance").then((m) => m.FinanzasTab), { loading: TabLoading })
const DefaultsTab = dynamic(() => import("./tabs/finance").then((m) => m.DefaultsTab), { loading: TabLoading })
const CatalogTab = dynamic(() => import("./tabs/catalogs").then((m) => m.CatalogTab), { loading: TabLoading })
const HogarTab = dynamic(() => import("./tabs/household").then((m) => m.HogarTab), { loading: TabLoading })
const DatosTab = dynamic(() => import("./tabs/data").then((m) => m.DatosTab), { loading: TabLoading })
const PlanTab = dynamic(() => import("@/features/planes/plan-tab").then((m) => m.PlanTab), { loading: TabLoading })
const ProvidersManager = dynamic(() => import("@/features/providers/providers-view").then((m) => m.ProvidersManager), { loading: TabLoading })

/**
 * Pestañas de Ajustes (AJTABS de la v4; se agrega "hogar"). Las integraciones del hogar son solo de IA y viven en
 * "Inteligencia artificial"; correo, WhatsApp, Telegram y demás los configura el administrador en la consola.
 */
export const TABS = [
  ["general", "General", "settings", "Cuenta", "Pantalla de inicio, ayudas y tour"],
  ["plan", "Mi plan", "crown", "Cuenta", "Premium, renovación y pagos"],
  ["apariencia", "Apariencia", "palette", "Cuenta", "Tema, tamaño de letra y densidad"],
  ["privacidad", "Privacidad", "eye-off", "Cuenta", "Ocultar montos y datos en mensajes"],
  ["seguridad", "Seguridad", "shield-check", "Cuenta", "Contraseña, dos pasos y bloqueo"],
  ["hogar", "Hogar y familia", "users", "Cuenta", "Quién más usa este hogar y con qué permisos"],
  ["ia", "Inteligencia artificial", "sparkles", "Inteligencia", "Proveedores, claves, modelo y funciones de la IA"],
  ["usoia", "Uso de IA", "gauge", "Inteligencia", "Créditos del mes, costo, ahorro y consultas"],
  ["alertas", "Alertas y notificaciones", "bell", "Avisos", "Qué te avisamos y por dónde: app, correo, WhatsApp, Telegram y push"],
  ["finanzas", "Finanzas", "calculator", "Finanzas", "Quincenas, 50/30/20, fondo y tasas"],
  ["defs", "Valores por defecto", "sliders-horizontal", "Finanzas", "Lo que aparece ya puesto en los formularios"],
  ["cats", "Categorías de gastos", "tag", "Finanzas", "Nombres, íconos y topes"],
  ["ings", "Tipos de ingreso", "arrow-down-to-line", "Finanzas", "Salario, honorarios, arriendos…"],
  ["ents", "Bancos y entidades", "landmark", "Finanzas", "Bancos, cooperativas, casas de empeño"],
  ["medios", "Medios de pago", "credit-card", "Finanzas", "Efectivo, tarjetas, Nequi…"],
  ["proveedores", "Proveedores", "store", "Finanzas", "A quién le pagas: servicios, arriendo, internet, colegio…"],
  ["rels", "Relaciones", "users", "Finanzas", "Tipos de contacto"],
  ["reglas", "Reglas de importación", "file-up", "Finanzas", "Categorías automáticas por palabra"],
  ["respaldo", "Datos y cuenta", "database", "Datos", "Respaldo, historial, descargar y eliminar"],
] as const
type TabId = (typeof TABS)[number][0]
/** Enlaces viejos: ?tab=integraciones abre la IA (lo único que el hogar configura). */
const ALIAS: Record<string, TabId> = { integraciones: "ia", servidor: "ia" }

function Body({ tab }: { tab: TabId }) {
  switch (tab) {
    case "general": return <GeneralTab />
    case "plan": return <PlanTab />
    case "apariencia": return <AparienciaTab />
    case "privacidad": return <PrivacidadTab />
    case "seguridad": return <SeguridadTab />
    case "hogar": return <HogarTab />
    case "ia": return <IaTab />
    case "usoia": return <AiUsageView />
    case "alertas": return <AlertasTab />
    case "finanzas": return <FinanzasTab />
    case "defs": return <DefaultsTab />
    case "cats": case "ings": case "ents": case "medios": case "rels": case "reglas": return <CatalogTab kind={tab} />
    case "proveedores": return <ProvidersManager embedded />
    case "respaldo": return <DatosTab />
  }
}

export function SettingsView() {
  const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("general"))
  const [q, setQ] = useState("")
  const cur = (TABS.find((t) => t[0] === (ALIAS[tab] ?? tab)) ?? TABS[0])
  const list = useMemo(() => TABS.filter((t) => !q || norm(t[1] + " " + t[4]).includes(norm(q))), [q])
  const groups = [...new Set(list.map((t) => t[3]))]
  return (
    <div className="grid gap-6">
      <PageHeader id="ajustes" />
      <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="sticky top-14 hidden max-h-[calc(100dvh-4.5rem)] gap-2 overflow-y-auto p-3 shadow-card ring-0 lg:flex">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="h-9 pr-8 pl-8" placeholder="Buscar ajuste…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ajuste" />
            {q && <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ("")} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full hover:bg-hover"><X className="size-3.5" /></button>}
          </div>
          {!list.length && (
            <div className="grid gap-1 p-2 text-sm text-muted-foreground">
              <p>No encontramos ajustes con “{q}”.</p>
              <button type="button" onClick={() => setQ("")} className="w-fit font-semibold text-link hover:underline">Ver todos</button>
            </div>
          )}
          <nav aria-label="Secciones de ajustes" className="grid gap-2">
            {groups.map((g) => (
              <div key={g} className="grid gap-0.5">
                <p className="px-2 pt-2 text-xs font-semibold text-muted-foreground uppercase">{g}</p>
                {list.filter((t) => t[3] === g).map((t) => {
                  const on = t[0] === cur[0]
                  return (
                    <button key={t[0]} type="button" onClick={() => setTab(t[0])} aria-current={on ? "page" : undefined} title={t[4]}
                      className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring", on && "bg-nav-active font-semibold text-nav-active-foreground hover:bg-nav-active")}>
                      <Icon name={t[2]} className="size-4 shrink-0" /><span className="min-w-0 truncate">{t[1]}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </Card>
        <div className="grid min-w-0 gap-6">
          <div className="lg:hidden"><label htmlFor="aj-sec" className="sr-only">Sección de ajustes</label><Combobox id="aj-sec" value={cur[0]} onChange={setTab} searchPlaceholder="Buscar ajuste…" options={TABS.map((t) => ({ value: t[0], label: t[1], icon: t[2], hint: t[3], group: t[3] }))} /></div>
          <div className="flex items-center gap-3">
            <ToneIcon icon={cur[2]} tone="brand" size="lg" className="rounded-xl" />
            <div className="grid min-w-0 gap-0.5"><h2 className="text-xl leading-tight font-semibold">{cur[1]}</h2><p className="text-sm text-muted-foreground">{cur[4]}</p></div>
          </div>
          <Body tab={cur[0] as TabId} />
        </div>
      </div>
    </div>
  )
}
