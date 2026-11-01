"use client"

import { useMemo, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/mirai/page-header"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { cn } from "@/lib/utils"
import { norm } from "@/lib/domain"
import { GeneralTab, AparienciaTab, PrivacidadTab } from "./tabs/account"
import { SeguridadTab } from "./tabs/security"
import { IaTab } from "./tabs/ia"
import { IntegrationsTab } from "./tabs/integrations"
import { AlertasTab } from "./tabs/alerts"
import { FinanzasTab, DefaultsTab } from "./tabs/finance"
import { CatalogTab } from "./tabs/catalogs"
import { HogarTab } from "./tabs/household"
import { DatosTab } from "./tabs/data"

/** Pestañas de Ajustes (AJTABS de la v4; "servidor" pasa a "integraciones" y se agrega "hogar"). */
export const TABS = [
  ["general", "General", "settings", "Cuenta", "Pantalla de inicio, ayudas y tour"],
  ["apariencia", "Apariencia", "palette", "Cuenta", "Tema, tamaño de letra y densidad"],
  ["privacidad", "Privacidad", "eye-off", "Cuenta", "Ocultar montos y datos en mensajes"],
  ["seguridad", "Seguridad", "shield-check", "Cuenta", "Contraseña, dos pasos y bloqueo"],
  ["hogar", "Hogar y familia", "users", "Cuenta", "Quién más usa este hogar y con qué permisos"],
  ["ia", "Inteligencia artificial", "sparkles", "Inteligencia", "Activar, orden de proveedores y funciones"],
  ["integraciones", "Integraciones", "plug", "Conexiones", "IA, correo, Telegram, WhatsApp, datos y Google"],
  ["alertas", "Alertas y notificaciones", "bell", "Avisos", "App, correo, Telegram, push y WhatsApp"],
  ["finanzas", "Finanzas", "calculator", "Finanzas", "Quincenas, 50/30/20, fondo y tasas"],
  ["defs", "Valores por defecto", "sliders-horizontal", "Finanzas", "Lo que aparece ya puesto en los formularios"],
  ["cats", "Categorías de gastos", "tag", "Finanzas", "Nombres, íconos y topes"],
  ["ings", "Tipos de ingreso", "arrow-down-to-line", "Finanzas", "Salario, honorarios, arriendos…"],
  ["ents", "Bancos y entidades", "landmark", "Finanzas", "Bancos, cooperativas, casas de empeño"],
  ["medios", "Medios de pago", "credit-card", "Finanzas", "Efectivo, tarjetas, Nequi…"],
  ["rels", "Relaciones", "users", "Finanzas", "Tipos de contacto"],
  ["reglas", "Reglas de importación", "file-up", "Finanzas", "Categorías automáticas por palabra"],
  ["respaldo", "Datos y cuenta", "database", "Datos", "Respaldo, historial, descargar y eliminar"],
] as const
type TabId = (typeof TABS)[number][0]

function Body({ tab }: { tab: TabId }) {
  switch (tab) {
    case "general": return <GeneralTab />
    case "apariencia": return <AparienciaTab />
    case "privacidad": return <PrivacidadTab />
    case "seguridad": return <SeguridadTab />
    case "hogar": return <HogarTab />
    case "ia": return <IaTab />
    case "integraciones": return <IntegrationsTab />
    case "alertas": return <AlertasTab />
    case "finanzas": return <FinanzasTab />
    case "defs": return <DefaultsTab />
    case "cats": case "ings": case "ents": case "medios": case "rels": case "reglas": return <CatalogTab kind={tab} />
    case "respaldo": return <DatosTab />
  }
}

export function SettingsView() {
  const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("general"))
  const [q, setQ] = useState("")
  const cur = (TABS.find((t) => t[0] === tab) ?? TABS[0])
  const list = useMemo(() => TABS.filter((t) => !q || norm(t[1] + " " + t[4]).includes(norm(q))), [q])
  const groups = [...new Set(list.map((t) => t[3]))]
  return (
    <div className="grid gap-6">
      <PageHeader id="ajustes" />
      <div className="grid items-start gap-6 lg:grid-cols-[17rem_1fr]">
        <Card className="sticky top-14 hidden gap-2 p-3 shadow-card ring-0 lg:flex">
          <div className="relative"><Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" /><Input className="h-9 pl-8" placeholder="Buscar ajuste…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ajuste" /></div>
          {!list.length && <p className="p-2 text-sm text-muted-foreground">Sin resultados.</p>}
          {groups.map((g) => (
            <div key={g} className="grid gap-0.5">
              <p className="px-2 pt-2 text-xs font-semibold text-muted-foreground uppercase">{g}</p>
              {list.filter((t) => t[3] === g).map((t) => (
                <button key={t[0]} type="button" onClick={() => setTab(t[0])} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover", t[0] === cur[0] && "bg-brand-soft font-semibold text-link")}>
                  <Icon name={t[2]} className="size-4" />{t[1]}
                </button>
              ))}
            </div>
          ))}
        </Card>
        <div className="grid gap-4">
          <div className="lg:hidden"><Combobox value={cur[0]} onChange={setTab} options={TABS.map((t) => ({ value: t[0], label: t[1], icon: t[2], hint: t[3], group: t[3] }))} /></div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={cur[2]} className="size-5" /></span>
            <div><h2 className="text-xl font-semibold">{cur[1]}</h2><p className="text-sm text-muted-foreground">{cur[4]}</p></div>
          </div>
          <Body tab={cur[0] as TabId} />
        </div>
      </div>
    </div>
  )
}
