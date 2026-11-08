"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { ArchiveRestore, Download, FileUp, Save, ShieldAlert, UserX } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { IconButton } from "@/components/mirai/tip"
import { ToneIcon, type IconTone } from "@/components/mirai/tone-icon"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { useApp } from "@/components/app/app-context"
import { can } from "@/lib/household/roles"
import { fetchAudit, fetchBackups } from "../api"
import { SampleButton } from "@/features/setup/sample-button"
import { backupUrl, createBackup, deleteAccount, deleteBackup, exportBookJson, exportMyData, formatBlocks, restoreBackup, restoreFromJson } from "@/features/data/api"
import { SettingRow, SettingSection, SettingStack } from "../ui"
import { saveFile } from "@/lib/pwa/save-file"

const TIPO = { auto: "Automático", manual: "Manual", antes_restaurar: "Antes de restaurar", importado: "Importado" } as Record<string, string>
const ACC = { crear: ["Creó", "pagado"], editar: ["Editó", "info"], borrar: ["Borró", "vencido"], restaurar: ["Recuperó", "estimado"] } as const
const ACC_ICON: Record<string, [string, IconTone]> = { crear: ["circle-plus", "green"], editar: ["pencil", "blue"], borrar: ["trash-2", "red"], restaurar: ["undo-2", "violet"] }
type AuditRow = { id: string; tabla: string; accion: string; resumen: string | null; created_at: string; quien: string }
const AUDIT_FILTERS: ListFilter<AuditRow>[] = [
  { value: "todo", label: "Todo" },
  { value: "crear", label: "Creó", match: (r) => r.accion === "crear" },
  { value: "editar", label: "Editó", match: (r) => r.accion === "editar" },
  { value: "borrar", label: "Borró", match: (r) => r.accion === "borrar" },
]
const auditText = (r: AuditRow) => `${r.quien} ${TABLA[r.tabla] ?? r.tabla} ${r.resumen ?? ""}`
const TABLA: Record<string, string> = { expenses: "gasto", incomes: "ingreso", extra_incomes: "ingreso extra", fixed_expenses: "gasto fijo", subscriptions: "suscripción", credit_cards: "tarjeta", card_purchases: "compra con tarjeta", loans: "préstamo", loan_payments: "pago de préstamo", contacts: "contacto", goals: "meta", investments: "inversión", assets: "bien", liabilities: "deuda", categories: "categoría", book_settings: "ajustes", family_members: "integrante", household_members: "persona del hogar", books: "libro" }
const BLOCKS = [["gastos", "Gastos"], ["ingresos", "Ingresos"], ["fijos", "Gastos fijos y suscripciones"], ["prestamos", "Préstamos"], ["contactos", "Contactos"], ["inversiones", "Inversiones"], ["balance", "Balance y tarjetas"], ["metas", "Metas y retos"], ["consejos", "Consultas del consejero"], ["calendario", "Recordatorios"]] as const

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
function download(name: string, text: string) {
  void saveFile(new Blob([text], { type: "application/json" }), name, "Copia de Mirai")
}

function Backups() {
  const { book, household } = useApp()
  const qc = useQueryClient()
  const router = useRouter()
  const owner = can(household.access, "ajustes")
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [restore, setRestore] = useState<string | null>(null)
  const { data, isPending } = useQuery({ queryKey: ["backups", book.id], queryFn: () => fetchBackups(book.id) })
  const refresh = () => qc.invalidateQueries({ queryKey: ["backups", book.id] })
  const act = async (k: string, f: () => Promise<unknown>, ok: string, reload?: boolean) => {
    setBusy(k)
    try { await f(); toast.success(ok); refresh(); if (reload) { qc.clear(); router.refresh() } } catch (e) { toast.error((e as Error).message) }
    setBusy(null)
  }
  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <SettingSection icon="database" title="Respaldos del libro" desc={`Copias de “${book.nombre}”. Mirai también guarda una copia antes de restaurar o formatear.`}>
      <div className="flex flex-wrap gap-2 pb-4">
        <Button disabled={!!busy} onClick={() => act("new", createBackup, "Respaldo guardado")}>{busy === "new" ? <Spinner /> : <Save />} Crear respaldo ahora</Button>
        <Button variant="outline" disabled={!!busy} onClick={() => act("dl", async () => download(`mirai-${stamp}.json`, await exportBookJson()), "Copia descargada")}>{busy === "dl" ? <Spinner /> : <Download />} Descargar copia</Button>
        {owner && <Button variant="outline" disabled={!!busy} onClick={() => file.current?.click()}>{busy === "up" ? <Spinner /> : <FileUp />} Restaurar desde archivo</Button>}
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ""
          if (f) await act("up", async () => restoreFromJson(await f.text()), "Libro restaurado", true)
        }} />
      </div>
      {isPending ? <Skeleton className="h-24" /> : !data?.length ? <p className="rounded-lg bg-secondary/60 p-4 text-sm text-muted-foreground">Aún no hay respaldos guardados. Crea uno ahora: queda en tu cuenta y lo puedes descargar cuando quieras.</p> : (
        <ul className="grid" aria-label="Respaldos guardados">
          {data.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 border-t py-2.5">
              <ToneIcon icon={b.tipo === "manual" ? "save" : b.tipo === "importado" ? "file-up" : "database"} tone={b.tipo === "manual" ? "brand" : "gray"} size="sm" />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{new Date(b.created_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-xs text-muted-foreground">{TIPO[b.tipo]} · {kb(b.size)}</p></div>
              <div className="flex flex-wrap items-center gap-1 max-sm:w-full max-sm:justify-end">
                <Button size="sm" variant="ghost" onClick={async () => { const u = await backupUrl(b.id); if (u) window.location.href = u }}><Download /> Descargar</Button>
                {owner && <Button size="sm" variant="ghost" onClick={() => setRestore(b.id)}><ArchiveRestore /> Restaurar</Button>}
                {owner && <IconButton size="icon-sm" icon="trash-2" destructive label="Borrar respaldo" disabled={busy === b.id} onClick={() => act(b.id, () => deleteBackup(b.id), "Respaldo borrado")} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!restore} onOpenChange={(o) => !o && setRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Restaurar este respaldo?</AlertDialogTitle><AlertDialogDescription>Los datos actuales del libro se reemplazan por los del respaldo. Antes guardamos una copia de lo que tienes hoy, por si te arrepientes.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button disabled={!!busy} onClick={async () => { const id = restore!; await act("rs", () => restoreBackup(id), "Libro restaurado", true); setRestore(null) }}>{busy === "rs" && <Spinner />} Restaurar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingSection>
  )
}

function AuditLog() {
  const { book } = useApp()
  const [n, setN] = useState(25)
  const { data, isPending } = useQuery({
    queryKey: ["audit", book.id, n],
    queryFn: (): Promise<AuditRow[]> => fetchAudit(book.id, n),
  })
  const c = useListControls(data, { text: auditText, filters: AUDIT_FILTERS })
  return (
    <SettingSection icon="history" title="Historial de cambios" desc="Quién creó, cambió o borró algo en este libro.">
      {isPending ? <Skeleton className="h-40" /> : !data?.length ? <EmptyState iso="ajustes" title="Aún no hay cambios registrados" description="Cuando alguien del hogar cree, cambie o borre algo, lo verás aquí." /> : (
        <div className="grid gap-3">
          <ListToolbar c={c} placeholder="Buscar por persona o dato" filters={AUDIT_FILTERS} />
          {!c.rows.length ? <NoResults c={c} /> : (
            <ul className="grid" aria-label="Cambios del libro">
              {c.rows.map((r) => {
                const [verb, tone] = ACC[r.accion as keyof typeof ACC] ?? ["Cambió", "gray"]
                const [icon, itone] = ACC_ICON[r.accion] ?? ["history", "gray"]
                return (
                  <li key={r.id} className="flex items-start gap-3 border-t py-2.5 text-sm">
                    <ToneIcon icon={icon} tone={itone} size="sm" />
                    <div className="min-w-0 flex-1"><p className="break-words"><b>{r.quien}</b> {verb.toLowerCase()} {TABLA[r.tabla] ?? r.tabla}{r.resumen ? <>: <span className="text-muted-foreground">{r.resumen}</span></> : null}</p>
                      <p className="text-xs text-muted-foreground"><time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString("es-CO")}>{formatDistanceToNowStrict(new Date(r.created_at), { locale: es, addSuffix: true })}</time></p></div>
                    <StatusPill tone={tone} className="max-sm:hidden">{verb}</StatusPill>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      {data && data.length >= n && <Button variant="outline" size="sm" className="mt-3 w-fit" onClick={() => setN(n + 50)}>Ver más cambios</Button>}
    </SettingSection>
  )
}

function Formatear() {
  const qc = useQueryClient()
  const router = useRouter()
  const [sel, setSel] = useState<string[]>([])
  const [conf, setConf] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <SettingSection icon="eraser" title="Formatear datos" desc="Envía a la papelera los bloques que elijas. Antes guardamos un respaldo automático.">
      <div className="grid gap-2 sm:grid-cols-2">
        {BLOCKS.map(([k, l]) => (
          <Label key={k} className="flex cursor-pointer items-center gap-2 rounded-md p-1 font-normal hover:bg-hover"><Checkbox checked={sel.includes(k)} onCheckedChange={(v) => setSel(v ? [...sel, k] : sel.filter((x) => x !== k))} />{l}</Label>
        ))}
      </div>
      {sel.length > 0 && (
        <div className="flex flex-col gap-2 pt-4 sm:flex-row">
          <Input className="h-10 sm:w-60" placeholder="Escribe BORRAR" value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Confirmación" />
          <Button variant="destructive" className="h-10" disabled={busy || conf.trim().toUpperCase() !== "BORRAR"} onClick={async () => {
            setBusy(true)
            try { await formatBlocks(sel, conf); toast.success("Listo, los datos quedaron en la papelera"); setSel([]); setConf(""); qc.clear(); router.refresh() } catch (e) { toast.error((e as Error).message) }
            setBusy(false)
          }}>{busy && <Spinner />} Formatear {sel.length} bloque{sel.length === 1 ? "" : "s"}</Button>
        </div>
      )}
    </SettingSection>
  )
}

function Cuenta() {
  const { user } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [conf, setConf] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <SettingSection id="eliminar" icon="shield-check" title="Tus datos personales (Ley 1581 de 2012)" desc="Puedes conocer, descargar y eliminar la información que Mirai guarda sobre ti.">
      <SettingRow title="Descargar todos mis datos" desc="Perfil, preferencias, consentimientos y todos tus libros en un archivo JSON.">
        <Button variant="outline" disabled={!!busy} onClick={async () => { setBusy("me"); try { download(`mirai-mis-datos-${new Date().toISOString().slice(0, 10)}.json`, await exportMyData()); toast.success("Archivo descargado") } catch (e) { toast.error((e as Error).message) } setBusy(null) }}>{busy === "me" ? <Spinner /> : <Download />} Descargar</Button>
      </SettingRow>
      <SettingRow title="Política de tratamiento de datos" desc="Cómo usamos y protegemos tu información."><Button variant="outline" asChild><Link href="/legal/privacidad">Ver política</Link></Button></SettingRow>
      <SettingRow title="Eliminar mi cuenta" desc={<>Se borra tu cuenta y los hogares en los que eres la única persona. No se puede deshacer. Si eres dueño de un hogar con más personas, primero pásaselo a alguien o bórralo en <Link className="text-link underline" href="/ajustes?tab=cuenta">Tu cuenta</Link>; en los demás hogares sales y tus movimientos se quedan a tu nombre.</>}>
        <Button variant="destructive" onClick={() => setOpen(true)}><UserX /> Eliminar cuenta</Button>
      </SettingRow>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center justify-center gap-2"><ShieldAlert className="size-5 text-danger" /> Eliminar tu cuenta</AlertDialogTitle>
            <AlertDialogDescription>Descarga antes tus datos si los quieres conservar. Los hogares donde eres la única persona se borran; de los demás sales. Si eres dueño de un hogar con más personas, primero pásalo o bórralo. Para confirmar, escribe tu correo: <b>{user.email}</b></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-4"><Input className="h-10" value={conf} onChange={(e) => setConf(e.target.value)} placeholder={user.email} aria-label="Tu correo" /></div>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={busy === "del" || conf.trim().toLowerCase() !== user.email.toLowerCase()} onClick={async () => {
              setBusy("del")
              const r = await deleteAccount({ confirm: conf }).catch(() => ({ ok: false, msg: "No pudimos eliminar tu cuenta. Intenta de nuevo." }))
              if (!r.ok) { toast.error(r.msg); setBusy(null); return }
              await (await import("@/lib/auth/mirai")).signOut()
              router.replace("/login?eliminada=1")
            }}>{busy === "del" && <Spinner />} Eliminar para siempre</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingSection>
  )
}

export function DatosTab() {
  return (
    <SettingStack>
      <Backups />
      <SettingSection icon="file-up" title="Traer datos" desc="Extractos del banco (CSV o Excel), respaldos de la versión anterior de Mirai o un ejemplo para explorar.">
        <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/importar"><FileUp /> Importar datos</Link></Button><SampleButton /></div>
      </SettingSection>
      <AuditLog />
      <Formatear />
      <Cuenta />
    </SettingStack>
  )
}
