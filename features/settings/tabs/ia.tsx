"use client"

import { ArrowDown, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Icon } from "@/components/mirai/icon"
import { Notice } from "@/components/mirai/notice"
import { StatusPill } from "@/components/mirai/status-pill"
import { useSettings } from "@/features/catalogs/hooks"
import { AI_KINDS, integrationByKind } from "@/lib/integrations/registry"
import { SettingRow, SettingSection } from "../ui"
import { useBookSettingsSave } from "../prefs"
import { IntegrationsTab, useIntegrations } from "./integrations"

type Ia = { on?: boolean; orden?: string[]; autocat?: boolean; hormiga?: boolean; ocr?: boolean; consejero?: boolean; asist?: boolean }

const FUNCS = [
  ["autocat", "Categoría automática", "Elige la categoría mientras escribes el gasto."],
  ["hormiga", "Detectar gastos hormiga", "Marca los gastos pequeños y frecuentes."],
  ["ocr", "Leer fotos y documentos", "Facturas, extractos, pagarés y comprobantes."],
  ["consejero", "Consejero IA", "Analiza si te alcanza antes de gastar o prestar."],
  ["asist", "Asistentes inteligentes", "Crear categorías, identificar bancos por NIT y detectar ciudades."],
] as const

export function IaTab() {
  const { data: cfg } = useSettings()
  const { data: ints } = useIntegrations()
  const save = useBookSettingsSave()
  if (!cfg) return <Skeleton className="h-96 w-full" />
  const ia = (cfg.ia ?? {}) as Ia
  const on = ia.on !== false
  const set = (p: Partial<Ia>) => save.mutate({ ia: { ...ia, ...p } as never })
  // Orden de uso: los guardados primero, luego el resto del registro.
  const orden = [...new Set([...(ia.orden ?? []).filter((k) => AI_KINDS.includes(k)), ...AI_KINDS])]
  const active = orden.filter((k) => ints?.[k]?.enabled)
  const move = (k: string, d: -1 | 1) => {
    const a = [...orden]; const i = a.indexOf(k); const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]; set({ orden: a })
  }

  return (
    <div className="grid gap-4">
      <SettingSection icon="sparkles" title="Inteligencia artificial">
        <SettingRow title="Usar inteligencia artificial" desc="Si la apagas, Mirai funciona igual con tus reglas, tu historial y palabras clave.">
          <Switch checked={on} onCheckedChange={(v) => set({ on: v })} aria-label="Usar inteligencia artificial" />
        </SettingRow>
      </SettingSection>

      {on && (
        <>
          {!active.length && (
            <Notice tone="warn" title="Aún no hay un proveedor de IA activo">
              Activa uno abajo. Recomendado para empezar sin pagar: <b>Google Gemini</b> (plan gratis) o <b>Groq</b>. Si el despliegue tiene <b>Vercel AI Gateway</b>, también sirve.
            </Notice>
          )}
          <SettingSection icon="wand-sparkles" title="Funciones" desc="Elige en qué te ayuda la IA.">
            {FUNCS.map(([k, t, d]) => (
              <SettingRow key={k} title={t} desc={d}><Switch checked={ia[k] !== false} onCheckedChange={(v) => set({ [k]: v })} aria-label={t} /></SettingRow>
            ))}
          </SettingSection>

          <SettingSection icon="scale" title="¿Qué tan estricto es el consejero?" desc="Define cuánto margen deja el consejero antes de decirte que algo no te alcanza.">
            <ChoiceCards cols={3} value={cfg.estricto} onChange={(v) => save.mutate({ estricto: v })} items={[
              { value: "prudente", label: "Prudente", desc: "Más margen de seguridad", icon: "shield-check" },
              { value: "equilibrado", label: "Equilibrado", desc: "Lo recomendado", icon: "scale", recommended: true },
              { value: "flexible", label: "Flexible", desc: "Acepta más riesgo", icon: "zap" },
            ]} />
          </SettingSection>

          <SettingSection icon="list-ordered" title="Orden de los proveedores" desc="Mirai usa el primero que esté activo; si falla, prueba con el siguiente.">
            <ol className="grid gap-1">
              {orden.map((k, i) => {
                const def = integrationByKind(k)!
                const act = !!ints?.[k]?.enabled
                return (
                  <li key={k} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                    <span className="w-5 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                    <Icon name={def.icon} className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium">{def.n}</span>
                    {act ? <StatusPill tone="pagado">Activo</StatusPill> : <StatusPill tone="gray">Apagado</StatusPill>}
                    <Button size="icon-sm" variant="ghost" aria-label={`Subir ${def.n}`} disabled={i === 0} onClick={() => move(k, -1)}><ArrowUp /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Bajar ${def.n}`} disabled={i === orden.length - 1} onClick={() => move(k, 1)}><ArrowDown /></Button>
                  </li>
                )
              })}
            </ol>
          </SettingSection>

          <IntegrationsTab only={["ia"]} />
          <p className="text-xs text-muted-foreground">Las claves de API se guardan cifradas en el servidor y solo se usan cuando pides algo a la IA. Las cuentas personales (ChatGPT Plus, Gemini Advanced, Claude Pro) no sirven: se necesita una clave de API.</p>
        </>
      )}
    </div>
  )
}
