"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { BookOpen, EyeOff, LifeBuoy, Megaphone, PlayCircle, RotateCcw } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { PAGES } from "@/lib/nav"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { fetchMyRule, saveMyRule } from "../api"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { togglePrivacy } from "@/components/app/privacy"
import { SettingRow, SettingSection, SettingSkeleton, SettingStack } from "../ui"
import { usePrefs } from "../prefs"

export function GeneralTab() {
  const { prefs, save } = usePrefs()
  const setHelp = useShell((s) => s.setHelp)
  if (!prefs) return <SettingSkeleton />
  return (
    <SettingStack>
      <SettingSection icon="house" title="Al abrir Mirai">
        <SettingRow title="Pantalla de inicio" desc="La sección que ves primero cada vez que entras.">
          <div className="w-64"><Combobox value={prefs.home_view} onChange={(v) => save({ home_view: v })} options={PAGES.map((p) => ({ value: p.id, label: p.label, icon: p.icon, hint: p.group?.label ?? p.section }))} /></div>
        </SettingRow>
      </SettingSection>
      <SettingSection icon="life-buoy" title="Centro de ayuda">
        <SettingRow title="Centro de ayuda" desc="Preguntas frecuentes, manual, guías, academia, glosario y soporte. Atajo: tecla ?.">
          <Button variant="outline" onClick={() => setHelp("@")}><LifeBuoy /> Abrir</Button>
        </SettingRow>
        <SettingRow title="Tour de la plataforma" desc="Un recorrido corto por las secciones principales.">
          <Button variant="outline" onClick={() => save({ tour_done: false })} asChild><Link href="/inicio?tour=1"><PlayCircle /> Hacer el tour</Link></Button>
        </SettingRow>
        <SettingRow title="Novedades y manual" desc="Lo nuevo de Mirai y guías paso a paso.">
          <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/novedades"><Megaphone /> Novedades</Link></Button><Button variant="outline" asChild><Link href="/manual"><BookOpen /> Manual</Link></Button></div>
        </SettingRow>
        <SettingRow title="Recuadros de ayuda" desc="Vuelve a mostrar los recuadros “¿Para qué sirve esta sección?”.">
          <Button variant="outline" onClick={() => { save({ extra: { ...((prefs.extra as object) ?? {}), helpHidden: [] } }); toast("Las ayudas se mostrarán de nuevo") }}><RotateCcw /> Mostrar de nuevo</Button>
        </SettingRow>
      </SettingSection>
      <SettingSection icon="coins" title="Fechas y moneda">
        <SettingRow title="Moneda" desc="Las cuentas en otra moneda se convierten con la TRM (Ajustes › Finanzas o la integración TRM del día)."><span className="font-medium">COP · Peso colombiano</span></SettingRow>
        <SettingRow title="Formato" desc="Así se ven las fechas y los valores."><span className="font-medium">31 oct 2026 · $ 1.250.000</span></SettingRow>
      </SettingSection>
    </SettingStack>
  )
}

export function AparienciaTab() {
  const { prefs, save } = usePrefs()
  const { theme, setTheme } = useTheme()
  if (!prefs) return <SettingSkeleton />
  return (
    <SettingStack>
      <SettingSection icon="palette" title="Tema">
        <ChoiceCards cols={3} value={theme ?? "system"} onChange={(v) => { setTheme(v); save({ theme: v }) }} items={[
          { value: "light", label: "Claro", desc: "Fondo blanco", icon: "sun" }, { value: "dark", label: "Oscuro", desc: "Descansa la vista de noche", icon: "moon" }, { value: "system", label: "Automático", desc: "Igual que tu equipo", icon: "monitor" },
        ]} />
      </SettingSection>
      <SettingSection icon="type" title="Tamaño del texto">
        <ChoiceCards cols={3} value={prefs.font_scale} onChange={(v) => save({ font_scale: v })} items={[{ value: "m", label: "Normal" }, { value: "l", label: "Grande" }, { value: "xl", label: "Muy grande" }]} />
      </SettingSection>
      <SettingSection icon="rows-3" title="Densidad y movimiento">
        <SettingRow title="Vista compacta" desc="Menos espacio entre elementos para ver más información."><Switch checked={prefs.dense} onCheckedChange={(v) => save({ dense: v })} aria-label="Vista compacta" /></SettingRow>
        <SettingRow title="Reducir animaciones" desc="Útil si te mareas con el movimiento en pantalla."><Switch checked={prefs.reduce_motion} onCheckedChange={(v) => save({ reduce_motion: v })} aria-label="Reducir animaciones" /></SettingRow>
      </SettingSection>
    </SettingStack>
  )
}

export function PrivacidadTab() {
  const { prefs, save } = usePrefs()
  const { user, book } = useApp()
  const qc = useQueryClient()
  const { data: rule } = useQuery({ queryKey: ["nrule", user.id, book.id], queryFn: async () => (await fetchMyRule(user.id, book.id)) as { ocultar_montos?: boolean } | null })
  if (!prefs) return <SettingSkeleton />
  return (
    <SettingStack>
      <SettingSection icon="eye-off" title="Ocultar montos">
        <SettingRow title="Ocultar los montos ahora" desc="Las cifras se ven borrosas; pasa el mouse para verlas. También con el ojo de arriba."><Button variant="outline" onClick={togglePrivacy}><EyeOff /> Ocultar o mostrar</Button></SettingRow>
        <SettingRow title="Ocultar siempre al abrir" desc="Útil si usas Mirai en un lugar público."><Switch checked={prefs.privacy_mode} onCheckedChange={(v) => save({ privacy_mode: v })} aria-label="Ocultar siempre al abrir" /></SettingRow>
        <SettingRow title="Ocultar al cambiar de ventana" desc="Difumina la pantalla cuando sales de Mirai."><Switch checked={prefs.privacy_blur_on_leave} onCheckedChange={(v) => save({ privacy_blur_on_leave: v })} aria-label="Ocultar al cambiar de ventana" /></SettingRow>
        <SettingRow title="No incluir valores en correos, Telegram y WhatsApp" desc="Los avisos dicen qué pago se acerca, pero no cuánto.">
          <Switch checked={!!rule?.ocultar_montos} aria-label="No incluir valores en avisos" onCheckedChange={async (v) => {
            try { await saveMyRule(user.id, book.id, { ocultar_montos: v }) } catch (e) { return toast.error("No se pudo guardar", { description: (e as Error).message }) }
            qc.invalidateQueries({ queryKey: ["nrule"] }); toast("Guardado")
          }} />
        </SettingRow>
      </SettingSection>
      <SettingSection icon="sparkles" title="¿Qué ve la inteligencia artificial?">
        <p className="text-sm text-muted-foreground">Solo el texto del movimiento, los valores y las fotos que tú subas, en el momento en que usas la función. Puedes apagarla en la pestaña Inteligencia artificial.</p>
      </SettingSection>
    </SettingStack>
  )
}
