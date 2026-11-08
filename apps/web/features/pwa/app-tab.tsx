"use client"

import { useState, useSyncExternalStore } from "react"
import { Download, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { toast } from "@/components/mirai/toast"
import { SettingRow, SettingSection, SettingStack } from "@/features/settings/ui"
import { PWA_SHORTCUTS } from "@/lib/pwa/config"
import { useInstall } from "./install"
import { usePwa } from "./store"
import { clearAppCaches, swEnabled } from "./sw-client"
import { OfflineSection } from "./offline-section"

const noop = () => () => {}
const PLAT: Record<string, string> = {
  "ios-safari": "iPhone o iPad (Safari)", "ios-other": "iPhone o iPad", "ios-inapp": "iPhone (dentro de otra app)", android: "Android",
  "desktop-chromium": "Computador (Chrome o Edge)", "mac-safari": "Mac (Safari)", firefox: "Firefox", otro: "Este navegador",
}

/** Ajustes › Mirai como app: instalar, accesos directos, actualizar y liberar espacio. */
export function AppTab() {
  const { platform, installed, can, install, direct } = useInstall()
  const update = usePwa((s) => s.update)
  const [busy, setBusy] = useState<"buscar" | "limpiar" | null>(null)
  const online = useSyncExternalStore((cb) => { addEventListener("online", cb); addEventListener("offline", cb); return () => { removeEventListener("online", cb); removeEventListener("offline", cb) } }, () => navigator.onLine, () => true)
  const badge = useSyncExternalStore(noop, () => "setAppBadge" in navigator, () => false)
  const ios = platform?.startsWith("ios")

  const buscar = async () => {
    setBusy("buscar")
    try {
      const reg = swEnabled() ? await navigator.serviceWorker.getRegistration() : null
      await reg?.update()
      await new Promise((r) => setTimeout(r, 1200))
      if (!usePwa.getState().update) toast.success("Tienes la última versión de Mirai")
    } catch { toast.error("No pudimos revisar", { description: "Revisa tu conexión e intenta de nuevo." }) } finally { setBusy(null) }
  }
  const limpiar = async () => {
    setBusy("limpiar")
    const n = await clearAppCaches().catch(() => 0)
    setBusy(null)
    toast.success("Listo", { description: n ? "Borramos los archivos guardados de la app. Se vuelven a descargar al usarla. Tus datos siguen en la nube." : "No había archivos guardados." })
  }

  return (
    <SettingStack>
      <SettingSection icon="smartphone" title="Instalar Mirai" desc="Mirai se instala desde el navegador, sin tienda de apps: queda con su ícono, se abre a pantalla completa y te avisa aunque no lo tengas abierto.">
        <SettingRow title={installed ? "Mirai está instalado" : "Instalar en este dispositivo"} desc={installed ? "Lo estás usando como app. Para quitarlo, mantén presionado el ícono (o clic derecho) › Desinstalar." : `${platform ? PLAT[platform] : "Revisando…"}${!can && platform ? ": instálalo desde Chrome o Edge (en iPhone, desde Safari)." : ""}`}>
          {installed ? <span className="text-sm font-semibold text-success">Instalada</span> : <Button onClick={() => void install()} disabled={!platform}><Download /> {direct ? "Instalar Mirai" : "Ver cómo instalar"}</Button>}
        </SettingRow>
        {ios && <SettingRow title="Notificaciones en iPhone" desc="Solo llegan con Mirai instalado en la pantalla de inicio (iOS 16.4 o más nuevo). Ábrelo desde el ícono y actívalas en Alertas."><span className="text-sm text-muted-foreground">iOS</span></SettingRow>}
        <SettingRow title="Número en el ícono" desc="Muestra en el ícono de Mirai cuántas notificaciones no has leído.">
          <span className="text-sm text-muted-foreground">{badge ? "Disponible" : "No disponible aquí"}</span>
        </SettingRow>
      </SettingSection>

      <OfflineSection />

      <SettingSection icon="zap" title="Accesos directos" desc={ios ? "En iPhone no hay accesos directos en el ícono: usa el botón + de abajo o la tecla N en un teclado." : "Mantén presionado el ícono de Mirai (en el computador, clic derecho) para ir directo a:"}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PWA_SHORTCUTS.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl p-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px]" style={{ background: s.tint }}><IsoIcon k={s.iso} size={26} /></span>
              <div className="grid min-w-0"><p className="truncate font-medium">{s.name}</p><p className="truncate text-xs text-muted-foreground">{s.description}</p></div>
            </li>
          ))}
        </ul>
      </SettingSection>

      <SettingSection icon="refresh-cw" title="Versión y espacio">
        <SettingRow title="Buscar actualizaciones" desc={update ? "Hay una versión nueva lista: toca Actualizar en el aviso." : "Mirai se actualiza solo; te avisamos cuando hay una versión nueva."}>
          <Button variant="outline" onClick={buscar} disabled={busy !== null || !online}>{busy === "buscar" ? <Spinner /> : <RefreshCw />} Buscar ahora</Button>
        </SettingRow>
        <SettingRow title="Sin conexión" desc="Si te quedas sin internet, Mirai te muestra una pantalla de aviso y se recarga solo cuando vuelve la señal. Tus datos siempre están en la nube.">
          <span className={online ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>{online ? "Conectado" : "Sin conexión"}</span>
        </SettingRow>
        <SettingRow title="Liberar espacio" desc="Borra los archivos de la app guardados en este dispositivo. No borra tus datos.">
          <Button variant="outline" onClick={limpiar} disabled={busy !== null}>{busy === "limpiar" ? <Spinner /> : <Trash2 />} Liberar espacio</Button>
        </SettingRow>
      </SettingSection>
    </SettingStack>
  )
}
