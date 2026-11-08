"use client"

import { useEffect, useState } from "react"
import { CloudDownload, Send, Trash2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/mirai/status-pill"
import { toast } from "@/components/mirai/toast"
import { useApp } from "@/components/app/app-context"
import { SettingRow, SettingSection } from "@/features/settings/ui"
import { flushOutbox, useOffline } from "@/lib/offline/outbox"
import { lastSavedAt, saveQueries } from "@/lib/offline/persist"
import { clearOfflineData, PAGES_CACHE } from "@/lib/offline/clear"
import { OFFLINE_PAGES, prepareOffline } from "./offline-sync"

const hace = (t: number | null) => {
  if (!t) return "Aún no"
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? "Hace un momento" : m < 60 ? `Hace ${m} min` : m < 1440 ? `Hace ${Math.round(m / 60)} h` : new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" })
}

async function contarPaginas() {
  try { return typeof caches === "undefined" ? 0 : (await (await caches.open(PAGES_CACHE)).keys()).length } catch { return 0 }
}

/** Ajustes › Mirai como app › Usar sin conexión: estado, preparar, enviar pendientes y borrar lo guardado. */
export function OfflineSection() {
  const { user } = useApp()
  const qc = useQueryClient()
  const { online, pending, syncing } = useOffline()
  const [paginas, setPaginas] = useState(0)
  const [guardado, setGuardado] = useState<number | null>(null)
  const [uso, setUso] = useState<string | null>(null)
  const refrescar = async () => {
    setPaginas(await contarPaginas())
    setGuardado((await lastSavedAt()) ?? null)
    const e = await navigator.storage?.estimate?.().catch(() => null)
    if (e?.usage) setUso(`${(e.usage / 1048576).toFixed(1).replace(".", ",")} MB`)
  }
  useEffect(() => { const t = setTimeout(() => void refrescar(), 0); return () => clearTimeout(t) }, [])

  const preparar = async () => {
    await saveQueries(qc, user.id)
    if (!prepareOffline(true)) return toast.error("No se pudo preparar", { description: online ? "Recarga la página e intenta de nuevo." : "Necesitas internet para preparar las secciones." })
    toast.success("Preparando Mirai para usar sin conexión", { description: `Guardamos ${OFFLINE_PAGES.length} secciones en este dispositivo. Toma unos segundos.` })
    setTimeout(() => void refrescar(), 6000)
  }
  const enviar = async () => {
    const r = await flushOutbox(user.id)
    if (!r) return toast.error("Sin conexión", { description: "Los cambios se envían solos cuando vuelva el internet." })
    toast.success(r.sent.length ? `Enviamos ${r.sent.length} cambios` : "No había cambios por enviar")
  }
  const borrar = async () => {
    if (pending && !window.confirm(`Tienes ${pending} cambios sin enviar. Si borras, se pierden. ¿Continuar?`)) return
    await clearOfflineData()
    useOffline.getState().set({ pending: 0 })
    await refrescar()
    toast.success("Borramos lo guardado en este dispositivo", { description: "Tus datos siguen en la nube." })
  }

  return (
    <SettingSection icon="cloud-off" title="Usar sin conexión" desc="Mirai guarda en este dispositivo lo último que viste y las secciones principales. Sin internet puedes consultarlas y registrar gastos, ingresos y demás: se envían solos cuando vuelva la conexión.">
      <SettingRow title="Conexión" desc={online ? "Tienes internet." : "Estás sin conexión: ves lo último guardado."}>
        <StatusPill tone={online ? "ok" : "warn"} check={online}>{online ? "En línea" : "Sin conexión"}</StatusPill>
      </SettingRow>
      <SettingRow title="Secciones guardadas" desc={`${paginas} de este dispositivo. Datos guardados: ${hace(guardado)}.${uso ? ` Espacio usado: ${uso}.` : ""}`}>
        <Button variant="outline" onClick={() => void preparar()} disabled={!online}><CloudDownload /> Preparar ahora</Button>
      </SettingRow>
      <SettingRow title="Cambios por enviar" desc={pending ? "Los hiciste sin conexión. Se envían solos; si quieres, envíalos ya." : "No hay cambios pendientes."}>
        <Button variant="outline" onClick={() => void enviar()} disabled={!pending || !online || syncing}><Send /> {pending ? `Enviar ${pending}` : "Enviar"}</Button>
      </SettingRow>
      <SettingRow title="Borrar lo guardado en este dispositivo" desc="Útil en un computador prestado. Al cerrar sesión se borra solo.">
        <Button variant="ghost" className="text-danger" onClick={() => void borrar()}><Trash2 /> Borrar</Button>
      </SettingRow>
    </SettingSection>
  )
}
