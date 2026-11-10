"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { ExternalLink, FlaskConical, Send, Volume2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { Notice } from "@/components/mirai/notice"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { fetchMyRule, fetchTelegramLinked, saveMyRule } from "../api"
import { useSettings } from "@/features/catalogs/hooks"
import { notifyChannels, sendDigestNow, sendTestNow, telegramConfirm, telegramStartLink, telegramUnlink } from "@/features/notify/api"
import { calendarStatus, connectGoogleViaApi, syncCalendar } from "@/features/correo/api"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { currentPush, disablePush, enablePush, pushSupported } from "@/features/notify/push-client"
import { AVISOS, CANALES, defaultMatriz, onFor, type CanalKey, type Canales, type Matriz } from "@/lib/notify/rules"
import { formatCoPhone, normalizeCoPhone } from "@/lib/notify/whatsapp"
import { cn } from "@/lib/utils"
import { playSound, setSoundEnabled, soundEnabled, subscribeSound } from "@/lib/sound"
import { SettingRow, SettingSection, SettingSkeleton, SettingStack } from "../ui"
import { useBookSettingsSave } from "../prefs"

const HORAS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? "a. m." : "p. m."}` }))

type RuleRow = { matriz: Matriz; canales: Canales & { gcal?: boolean }; hora: number; frecuencia: string; silencio: { on?: boolean; desde?: number; hasta?: number }; ocultar_montos: boolean; email_to: string | null; whatsapp_to: string | null; last_sent: Record<string, string>; notif: Record<string, boolean> | null }

function useRule() {
  const { user, book } = useApp()
  const qc = useQueryClient()
  const key = ["nrule-full", user.id, book.id]
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await fetchMyRule(user.id, book.id)
      return (data ?? { matriz: {}, canales: { app: true, popup: true }, hora: 7, frecuencia: "diario", silencio: { on: false, desde: 22, hasta: 7 }, ocultar_montos: false, email_to: null, whatsapp_to: null, last_sent: {}, notif: null }) as unknown as RuleRow
    },
  })
  const save = async (p: Partial<RuleRow>, quiet?: boolean) => {
    qc.setQueryData(key, (o: RuleRow) => ({ ...o, ...p }))
    try { await saveMyRule(user.id, book.id, p as Record<string, unknown>) } catch (e) { return toast.error("No se pudo guardar", { description: (e as Error).message }) }
    if (!quiet) toast("Guardado")
    qc.invalidateQueries({ queryKey: ["nrule"] })
  }
  return { rule: q.data, save }
}

/** "Enviarme una prueba" (mensaje corto) y "Enviar resumen ahora" (lo pendiente de hoy) por un canal. */
function SendNow({ canal, digest = true }: { canal: Exclude<CanalKey, "app">; digest?: boolean }) {
  const [busy, setBusy] = useState<"test" | "digest" | null>(null)
  const run = async (k: "test" | "digest") => {
    setBusy(k); const r = await (k === "test" ? sendTestNow(canal) : sendDigestNow(canal)); setBusy(null)
    toast[r.ok ? "success" : "error"](r.ok ? (k === "test" ? "Prueba enviada" : "Resumen enviado") : "No se pudo enviar", { description: r.msg, duration: r.ok ? 5000 : 12000 })
  }
  const label = CANALES.find((c) => c.k === canal)!.t
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("test")} aria-label={`Enviarme una prueba por ${label}`}>{busy === "test" ? <Spinner /> : <FlaskConical />} Enviarme una prueba</Button>
      {digest && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run("digest")} aria-label={`Enviar resumen ahora por ${label}`}>{busy === "digest" ? <Spinner /> : <Send />} Enviar resumen ahora</Button>}
    </div>
  )
}

/** Canal que Mirai aún no ofrece (lo activa el administrador). */
const NoDisponible = ({ que }: { que: string }) => <p className="pt-3 text-sm text-muted-foreground">Mirai todavía no envía avisos por {que}. Cuando esté disponible podrás activarlo aquí.</p>

function TelegramLink() {
  const { user } = useApp()
  const qc = useQueryClient()
  const { data: linked } = useQuery({ queryKey: ["tg-link", user.id], queryFn: () => fetchTelegramLinked() })
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (linked) return (
    <div className="flex flex-wrap items-center gap-2"><StatusPill tone="pagado" check>Chat vinculado</StatusPill>
      <Button size="sm" variant="ghost" onClick={async () => { await telegramUnlink(); qc.invalidateQueries({ queryKey: ["tg-link"] }); toast("Telegram desvinculado") }}>Desvincular</Button>
    </div>
  )
  return (
    <div className="grid gap-2">
      {!url ? (
        <Button size="sm" variant="outline" className="w-fit" disabled={busy} onClick={async () => { setBusy(true); const r = await telegramStartLink(); setBusy(false); if (r.ok) { setUrl(r.url!); window.open(r.url, "_blank") } else toast.error(r.msg) }}>{busy ? <Spinner /> : <Icon name="send" />} Vincular Telegram</Button>
      ) : (
        <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm">
          <p>1. Abre <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link underline">el bot en Telegram <ExternalLink className="size-3.5" /></a> y toca <b>Iniciar</b>.</p>
          <p>2. Vuelve aquí y confirma.</p>
          <Button size="sm" className="w-fit" disabled={busy} onClick={async () => { setBusy(true); const r = await telegramConfirm(); setBusy(false); toast[r.ok ? "success" : "error"](r.msg); if (r.ok) qc.invalidateQueries({ queryKey: ["tg-link"] }) }}>{busy && <Spinner />} Ya lo hice</Button>
        </div>
      )}
    </div>
  )
}

function PushDevice() {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { currentPush().then((s) => setOn(!!s)).catch(() => setOn(false)) }, [])
  if (!pushSupported()) return <p className="text-sm text-muted-foreground">Este navegador no permite notificaciones push. En iPhone, primero instala Mirai en la pantalla de inicio (Compartir › Agregar a inicio).</p>
  return (
    <div className="flex flex-wrap items-center gap-2">
      {on ? <StatusPill tone="pagado" check>Activo en este dispositivo</StatusPill> : <StatusPill tone="gray">Apagado en este dispositivo</StatusPill>}
      <Button size="sm" variant="outline" disabled={busy || on === null} onClick={async () => {
        setBusy(true)
        try { if (on) { await disablePush(); setOn(false); toast("Push apagado en este dispositivo") } else { await enablePush(); setOn(true); toast.success("Push activado en este dispositivo") } }
        catch (e) { toast.error((e as Error).message) }
        setBusy(false)
      }}>{busy && <Spinner />}{on ? "Apagar aquí" : "Activar en este dispositivo"}</Button>
    </div>
  )
}

/** Google Calendar: Mirai lleva tus pagos y cobros y los mantiene al día cada mañana (la sincronización corre en la API). */
function GoogleCalendarSection({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: st } = useQuery({ queryKey: ["gcal-status"], queryFn: () => calendarStatus(), staleTime: 60_000 })
  const [busy, setBusy] = useState(false)
  const sync = async () => {
    setBusy(true); const r = await syncCalendar(); setBusy(false)
    toast[r.ok ? "success" : "error"](r.ok ? r.msg : "No se pudo sincronizar", r.ok ? undefined : { description: r.msg })
    qc.invalidateQueries({ queryKey: ["gcal-status"] })
  }
  return (
    <SettingSection icon="calendar-check" title="Google Calendar" desc="Tus pagos y cobros de los próximos 45 días en tu calendario. Si cambias un monto, pagas o borras algo, lo actualizamos solos cada mañana.">
      {!st ? <Spinner /> : !st.plan ? <p className="pt-3 text-sm text-muted-foreground">Llevar tus pagos a Google Calendar está en Mirai Premium.</p> : !st.conectado ? (
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <p className="text-sm text-muted-foreground">Aún no conectas tu Google Calendar.</p>
          <Button variant="outline" size="sm" onClick={() => void connectGoogleViaApi("calendar", "/ajustes?tab=alertas")}><BrandLogo k="google-calendar" size={16} bare /> Conectar Google Calendar</Button>
        </div>
      ) : <>
        <SettingRow title="Mantener mis pagos en Google Calendar" desc={st.eventos ? `Mirai lleva ${st.eventos} evento${st.eventos === 1 ? "" : "s"} en tu calendario.` : "Cada mañana revisamos tus pagos y cobros."}>
          <Switch checked={on} onCheckedChange={onChange} aria-label="Mantener mis pagos en Google Calendar" />
        </SettingRow>
        <div className="pt-4"><Button variant="outline" size="sm" disabled={busy} onClick={sync}>{busy ? <Spinner /> : <BrandLogo k="google-calendar" size={16} bare />} Sincronizar ahora</Button></div>
      </>}
    </SettingSection>
  )
}

export function AlertasTab() {
  const { rule, save } = useRule()
  const { data: cfg } = useSettings()
  const { data: ready } = useQuery({ queryKey: ["notify-channels"], queryFn: () => notifyChannels(), staleTime: 5 * 60_000 })
  const saveCfg = useBookSettingsSave()
  const { user } = useApp()
  const [email, setEmail] = useState<string | null>(null)
  const [wa, setWa] = useState<string | null>(null)
  if (!rule || !cfg) return <SettingSkeleton sections={3} rows={4} />

  // Interruptores por persona (notification_rules.notif); lo del libro (book_settings.notif) es el valor por defecto.
  const bookNotif = (cfg.notif ?? {}) as Record<string, boolean>
  const notif: Record<string, boolean> = { ...bookNotif, ...(rule.notif ?? {}) }
  const matriz = Object.keys(rule.matriz ?? {}).length ? rule.matriz : defaultMatriz()
  const can = rule.canales ?? {}
  const setCan = (k: keyof RuleRow["canales"], v: boolean) => save({ canales: { ...can, [k]: v } })
  const setMat = (a: string, c: CanalKey, v: boolean) => save({ matriz: { ...matriz, [a]: { ...matriz[a as keyof Matriz], [c]: v } } }, true)
  // Canales que Mirai ofrece (los configura el administrador). Mientras carga no se marcan como no disponibles.
  const ok = (c: "email" | "telegram" | "push" | "whatsapp") => !ready || ready[c]
  const notReady = (["email", "telegram", "push", "whatsapp"] as const).filter((c) => can[c] && !ok(c))
  const waNum = normalizeCoPhone(wa ?? rule.whatsapp_to)
  const waBad = !!(wa ?? rule.whatsapp_to) && !waNum

  return (
    <SettingStack>
      {notReady.length > 0 && (
        <Notice tone="warn" title="Por ahora no podemos enviarte por ese medio">
          Activaste {notReady.map((c) => CANALES.find((x) => x.k === c)!.t).join(", ")}, pero Mirai todavía no tiene ese servicio disponible. Te seguimos avisando en la app.
        </Notice>
      )}

      <SettingSection icon="table" title="¿Qué te avisamos y por dónde?" desc="Apaga un aviso con su interruptor o elige por qué canal te llega. Es solo para ti: las demás personas del hogar tienen sus propios avisos.">
        <div className="-mx-2 overflow-x-auto" role="region" aria-label="Avisos por canal" tabIndex={0}>
          <table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Aviso</th>
              {CANALES.map((c) => <th key={c.k} className="px-2 py-2 text-center font-medium"><span className="inline-flex flex-col items-center gap-1"><Icon name={c.icon} className="size-4" />{c.t}</span></th>)}
            </tr></thead>
            <tbody>
              {AVISOS.map((a) => {
                const on = notif[a.k] !== false
                return (
                  <tr key={a.k} className={cn("border-t", !on && "opacity-55")}>
                    <td className="px-2 py-3">
                      <div className="flex items-start gap-2">
                        <Switch checked={on} aria-label={a.t} onCheckedChange={(v) => save({ notif: { ...(rule.notif ?? {}), [a.k]: v } })} />
                        <div><p className="font-medium">{a.t}</p><p className="text-xs text-muted-foreground">{a.d}</p></div>
                      </div>
                    </td>
                    {CANALES.map((c) => (
                      <td key={c.k} className="px-2 py-3 text-center">
                        <Checkbox aria-label={`${a.t} por ${c.t}`} disabled={!on || can[c.k] === false || (c.k !== "app" && !can[c.k])} checked={onFor(matriz, a.k, c.k)} onCheckedChange={(v) => setMat(a.k, c.k, v === true)} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SettingSection>

      <SettingSection icon="bell" title="En la aplicación">
        <SettingRow title="Avisos en la campana" desc="Los avisos aparecen en la campana de arriba."><Switch checked={can.app !== false} onCheckedChange={(v) => setCan("app", v)} aria-label="Avisos en la campana" /></SettingRow>
        <SoundRow />
        <SettingRow title="Avisos emergentes al abrir" desc="Hasta 3 avisos urgentes cuando entras a Mirai."><Switch checked={can.popup !== false} disabled={can.app === false} onCheckedChange={(v) => setCan("popup", v)} aria-label="Avisos emergentes al abrir" /></SettingRow>
        <SettingRow title="Horario de silencio" desc="No mostramos emergentes ni enviamos push en este horario.">
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={!!rule.silencio?.on} onCheckedChange={(v) => save({ silencio: { ...rule.silencio, on: v } })} aria-label="Horario de silencio" />
            {rule.silencio?.on && <>
              <div className="w-32"><Combobox value={String(rule.silencio.desde ?? 22)} onChange={(v) => save({ silencio: { ...rule.silencio, desde: +v } })} options={HORAS} /></div>
              <span className="text-sm">a</span>
              <div className="w-32"><Combobox value={String(rule.silencio.hasta ?? 7)} onChange={(v) => save({ silencio: { ...rule.silencio, hasta: +v } })} options={HORAS} /></div>
            </>}
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection icon="clock" title="Resumen fuera de la app" desc="Te enviamos un resumen con lo pendiente, aunque no abras Mirai.">
        <SettingRow title="¿Cada cuánto?"><div className="w-64"><Combobox value={rule.frecuencia} onChange={(v) => save({ frecuencia: v })} options={[{ value: "diario", label: "Un resumen al día" }, { value: "semanal", label: "Un resumen a la semana (lunes)" }, { value: "nunca", label: "No enviar resúmenes" }]} /></div></SettingRow>
        <SettingRow title="Hora del resumen" desc="Hora de Colombia. Te llega a esa hora, una sola vez al día."><div className="w-40"><Combobox value={String(rule.hora)} onChange={(v) => save({ hora: +v })} options={HORAS} /></div></SettingRow>
      </SettingSection>

      <GoogleCalendarSection on={can.gcal !== false} onChange={(v) => setCan("gcal", v)} />

      <SettingSection icon="mail" title="Correo electrónico">
        <SettingRow title="Enviar resumen por correo" desc="Te llega al correo lo que tienes pendiente y los avisos que marques arriba, como los movimientos de tu familia."><Switch checked={!!can.email} disabled={!can.email && !ok("email")} onCheckedChange={(v) => setCan("email", v)} aria-label="Enviar resumen por correo" /></SettingRow>
        {!ok("email") && <NoDisponible que="correo" />}
        {can.email && ok("email") && <>
          <SettingRow title="Enviar a" desc="Si lo dejas vacío usamos el correo de tu cuenta.">
            <Input type="email" className="h-10 w-72 max-sm:w-full" placeholder={user.email} value={email ?? rule.email_to ?? ""} onChange={(e) => setEmail(e.target.value)} onBlur={() => email !== null && save({ email_to: email.trim() || null })} aria-label="Correo para avisos" />
          </SettingRow>
          <div className="flex flex-wrap items-center gap-3 pt-4"><SendNow canal="email" />{rule.last_sent?.email && <span className="text-xs text-muted-foreground">Último resumen: {rule.last_sent.email}</span>}</div>
        </>}
      </SettingSection>

      <SettingSection icon="send" title="Telegram" desc="100 % gratis. Recomendado para recibir los avisos en el celular.">
        <SettingRow title="Enviar resumen por Telegram"><Switch checked={!!can.telegram} disabled={!can.telegram && !ok("telegram")} onCheckedChange={(v) => setCan("telegram", v)} aria-label="Enviar resumen por Telegram" /></SettingRow>
        {!ok("telegram") && <NoDisponible que="Telegram" />}
        {can.telegram && ok("telegram") && <div className="grid gap-3 pt-4"><TelegramLink /><SendNow canal="telegram" /></div>}
      </SettingSection>

      <SettingSection icon="bell-ring" title="Notificaciones push" desc="Avisos en este celular o computador, como los de cualquier app.">
        <SettingRow title="Enviar avisos push"><Switch checked={!!can.push} disabled={!can.push && !ok("push")} onCheckedChange={(v) => setCan("push", v)} aria-label="Enviar avisos push" /></SettingRow>
        {!ok("push") && <NoDisponible que="notificaciones push" />}
        {can.push && ok("push") && <div className="grid gap-3 pt-4"><PushDevice /><SendNow canal="push" digest={false} /></div>}
      </SettingSection>

      <SettingSection icon="message-circle" title="WhatsApp" desc="Te enviamos el resumen al WhatsApp desde el número oficial de Mirai.">
        <SettingRow title="Enviar resumen por WhatsApp" desc="El resumen y los avisos que marques arriba, como los movimientos de tu familia."><Switch checked={!!can.whatsapp} disabled={!can.whatsapp && !ok("whatsapp")} onCheckedChange={(v) => setCan("whatsapp", v)} aria-label="Enviar resumen por WhatsApp" /></SettingRow>
        {!ok("whatsapp") && <NoDisponible que="WhatsApp" />}
        {can.whatsapp && ok("whatsapp") && <>
          <SettingRow title="Tu número" desc={waBad ? undefined : waNum ? `Te escribimos al ${formatCoPhone(waNum)}.` : "Tu celular de Colombia (10 dígitos)."}>
            <div className="grid gap-1">
              <InputGroup className="h-10 w-60 max-sm:w-full"><InputGroupAddon><InputGroupText>+57</InputGroupText></InputGroupAddon>
                <InputGroupInput inputMode="numeric" placeholder="300 123 4567" value={wa ?? rule.whatsapp_to ?? ""} aria-invalid={waBad || undefined} onChange={(e) => setWa(e.target.value.replace(/\D/g, "").slice(0, 12))} onBlur={() => {
                  if (wa === null) return
                  const n = normalizeCoPhone(wa)
                  if (wa && !n) return void toast.error("Revisa el número", { description: "Debe ser un celular de 10 dígitos que empiece por 3, por ejemplo 315 123 4567." })
                  save({ whatsapp_to: n ? n.slice(2) : null }); setWa(null)
                }} aria-label="Número de WhatsApp" />
              </InputGroup>
              {waBad && <p className="text-xs text-danger">Debe ser un celular de 10 dígitos que empiece por 3.</p>}
            </div>
          </SettingRow>
          {waNum && !waBad && <div className="pt-4"><SendNow canal="whatsapp" /></div>}
        </>}
      </SettingSection>

      <SettingSection icon="calendar-clock" title="¿Cuándo?">
        <SettingRow title="Avisarme con (días de anticipación)"><Input type="number" min={0} max={30} className="h-10 w-24" defaultValue={cfg.anticipo} onBlur={(e) => +e.target.value !== cfg.anticipo && saveCfg.mutate({ anticipo: Math.max(0, Math.min(30, +e.target.value || 0)) })} aria-label="Días de anticipación" /></SettingRow>
        <SettingRow title="Avisar cuando una categoría llegue al (%) de su tope"><Input type="number" min={10} max={200} className="h-10 w-24" defaultValue={cfg.alerta_pres} onBlur={(e) => +e.target.value !== cfg.alerta_pres && saveCfg.mutate({ alerta_pres: Math.max(10, Math.min(200, +e.target.value || 100)) })} aria-label="Porcentaje del tope" /></SettingRow>
        <SettingRow title="Límite de gastos hormiga al mes"><div className="w-48"><MoneyAutosave value={+cfg.limite} onSave={(v) => saveCfg.mutate({ limite: v })} /></div></SettingRow>
        <SettingRow title="Valor de referencia de un gasto hormiga" desc="Los gastos por debajo de este valor pueden contarse como hormiga."><div className="w-48"><MoneyAutosave value={+cfg.umbral} onSave={(v) => saveCfg.mutate({ umbral: v })} /></div></SettingRow>
      </SettingSection>
    </SettingStack>
  )
}

/** Sonido de los avisos en este dispositivo (lib/sound.ts): toasts y notificaciones nuevas de la campana. */
function SoundRow() {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => true)
  return (
    <SettingRow title="Sonido de los avisos" desc="Suena un tono corto cuando aparece un aviso o llega una notificación. Se guarda en este dispositivo.">
      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={on} onCheckedChange={(v) => { setSoundEnabled(v); if (v) playSound("bell", { force: true }) }} aria-label="Sonido de los avisos" />
        <Button variant="ghost" size="sm" onClick={() => playSound("bell", { force: true })}><Volume2 /> Probar</Button>
      </div>
    </SettingRow>
  )
}
