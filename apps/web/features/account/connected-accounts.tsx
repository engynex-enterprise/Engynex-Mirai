"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowRightLeft, CircleHelp, KeyRound, Mail, Pencil, Plus, Settings, Trash2, Wand2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { Panel } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { googleIdentities, signInMethods, type Method } from "@/lib/account/account"
import { haceCuanto } from "@/lib/household/invites"
import { Confirm } from "@/features/household/roles-ui"
import { openHelpCenter } from "@/components/app/help-sheet"
import { removeMethod } from "./api"
import { EmailChangeDialog, PendingEmail } from "./email-change"
import { MoveAccountDialog } from "./move-account"
import { PasswordForm } from "./password-form"
import { useAccount, useRefreshAccount } from "./use-account"

const PERFIL = "/perfil"

/** Mensajes al volver de Google o de un enlace de cambio de correo. */
const RETURN_MSG: Record<string, [ok: boolean, title: string, desc?: string]> = {
  "cuentas:ya_existe": [false, "Esa cuenta de Google ya es de otra persona en Mirai", "Cada cuenta de Google solo puede estar en una cuenta de Mirai. Entra con esa cuenta y bórrala (Ajustes › Datos y cuenta) o elige otra cuenta de Google."],
  "cuentas:sin_vincular": [false, "No pudimos conectar la cuenta de Google", "Por ahora no se pueden conectar cuentas de Google. Escríbenos desde Ayuda › Soporte y te ayudamos."],
  "cuentas:error": [false, "No pudimos conectar la cuenta de Google", "Intenta de nuevo. Si cancelaste en la ventana de Google, no pasó nada."],
  "correo:listo": [true, "¡Listo! Cambiamos el correo de tu cuenta", "Desde ahora entras y recibes los avisos en tu correo nuevo."],
  "correo:falta_otro": [true, "Confirmaste uno de los dos enlaces", "Abre también el enlace que te llegó al otro correo para terminar el cambio."],
}

/**
 * Perfil › "Cómo entras a Mirai": las formas de entrar (Google con su correo, correo y contraseña, enlace mágico) con
 * Cambiar y Quitar, el correo de la cuenta con su cambio pendiente, Agregar otra forma de entrar y el paso a paso
 * "Mi correo de Google ya no lo uso". Ajustes › Tu cuenta enlaza aquí (sin repetir la lógica).
 */
export function ConnectedAccounts() {
  const { data, isPending } = useAccount()
  const refresh = useRefreshAccount()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [emailOpen, setEmailOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [confirm, setConfirm] = useState<Method | null>(null)
  const [reauth, setReauth] = useState(false)
  const [offerOld, setOfferOld] = useState<Method | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const account = data?.account

  // Vuelta de Google o del enlace del correo: mensaje, ofrecer quitar la cuenta anterior y limpiar la dirección.
  const cuentas = params.get("cuentas")
  const correo = params.get("correo")
  const old = params.get("old")
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!cuentas && !correo) return
    if (!account) return
    const key = `${cuentas}|${correo}|${old}`
    if (handled.current === key) return
    handled.current = key
    if (correo === "listo") router.refresh()
    const m = RETURN_MSG[`cuentas:${cuentas}`] ?? RETURN_MSG[`correo:${correo}`]
    if (m) (m[0] ? toast.success : toast.error)(m[1], { description: m[2] })
    if (cuentas === "conectada") {
      const gs = googleIdentities(account)
      const prev = old ? gs.find((g) => g.id === old) : undefined
      if (old && prev && gs.length > 1) { const m = signInMethods(account).find((x) => x.identityId === prev.id) ?? null; setTimeout(() => setOfferOld(m), 0) }
      else if (old && prev && gs.length === 1) toast("Elegiste la misma cuenta de Google", { description: "Vuelve a tocar Cambiar y escoge tu otra cuenta de Google en la lista." })
      else toast.success("Conectamos tu cuenta de Google", { description: "Ya puedes entrar con ella." })
    }
    router.replace(`${pathname}#cuentas`, { scroll: false })
    document.getElementById("cuentas")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [cuentas, correo, old, account, pathname, router])

  const linkGoogle = async (oldId?: string) => {
    setLinking(true)
    const next = `${PERFIL}?cuentas=conectada${oldId ? `&old=${oldId}` : ""}#cuentas`
    const r = await (await import("@/lib/auth/mirai")).linkGoogle(next)
    if (!r.ok) { setLinking(false); toast.error("No pudimos abrir Google", { description: r.msg }) }
  }

  const remove = async (m: Method) => {
    setBusy(m.key)
    const r = await removeMethod(m.kind === "google" ? { kind: "google", identityId: m.identityId! } : { kind: "password" }).catch(() => ({ ok: false, msg: "Intenta de nuevo en un momento.", code: undefined }))
    setBusy(null)
    if (!r.ok) { if (r.code === "reauth") setReauth(true); else toast.error(r.msg); return }
    toast.success(r.msg)
    refresh(); router.refresh()
  }

  const reenter = async () => {
    await (await import("@/lib/auth/mirai")).signOut()
    router.replace(`/login?next=${encodeURIComponent(`${PERFIL}#cuentas`)}`)
  }

  if (isPending || !account) return (
    <Panel id="cuentas" title="Cómo entras a Mirai" icon="link" className="h-auto">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando cuentas">{[0, 1, 2].map((i) => <div key={i} className="grid gap-3 rounded-xl border p-4"><div className="flex items-center gap-3"><Skeleton className="size-10 rounded-[28%]" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-40" /></div></div><Skeleton className="h-9 w-full" /></div>)}</div>
    </Panel>
  )

  const methods = signInMethods(account)
  const gs = googleIdentities(account)

  const removeBtn = (m: Method) => {
    const btn = <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={!m.removable || busy === m.key} onClick={() => setConfirm(m)} aria-label={`Quitar ${m.label}`}>{busy === m.key ? <Spinner /> : <Trash2 />} Quitar</Button>
    return m.removable ? btn : <Tip label={m.reason}><span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{btn}</span></Tip>
  }

  return (
    <Panel id="cuentas" title="Cómo entras a Mirai" icon="link" className="h-auto scroll-mt-20"
      action={<Button size="sm" variant="ghost" onClick={() => openHelpCenter("cuenta")}><CircleHelp /> Cómo funciona</Button>}
      description="Aquí decides con qué entras: tu cuenta de Google, tu contraseña o un enlace al correo. Cambiar de correo no borra nada: tus gastos, metas y hogar siguen igual. (Nada que ver con tus cuentas del banco.)">
      {/* Correo de la cuenta: la fila ancha de arriba */}
      <div className="grid gap-2" data-method="correo">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-secondary/50 p-4">
          <ToneIcon icon="mail" tone="blue" className="size-12 rounded-[28%]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">Correo de tu cuenta</p>
            <p className="truncate text-[17px] leading-6 font-semibold" title={account.email ?? ""}>{account.email}</p>
            <p className="text-[13px] text-muted-foreground">Aquí te llegan los avisos y los enlaces para entrar.</p>
          </div>
          <Button size="sm" variant="outline" className="max-sm:w-full" onClick={() => setEmailOpen(true)}><Pencil /> Cambiar correo</Button>
        </div>
        <PendingEmail account={account} onDone={refresh} />
      </div>

      {/* Formas de entrar: una tarjeta por forma, en dos o tres columnas según el ancho */}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Formas de entrar">
        {methods.map((m) => (
          <li key={m.key} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4" data-method={m.kind}>
            <div className="flex min-w-0 items-start gap-3">
              {m.kind === "google" ? <BrandLogo k="google" size={40} /> : <ToneIcon icon={m.kind === "password" ? "key-round" : "wand-sparkles"} tone={m.kind === "password" ? "navy" : "violet"} className="size-10 rounded-[28%]" />}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-5 font-semibold">{m.label}</p>
                <p className="truncate text-[13px] text-muted-foreground" title={m.detail}>{m.kind === "magic" ? `Te llega a ${m.detail}` : m.detail}</p>
              </div>
              {m.kind === "magic" && <Tip label="Siempre puedes entrar así. Si cambias tu correo, el enlace te llega al nuevo."><span><StatusPill tone="ok">Siempre activo</StatusPill></span></Tip>}
            </div>
            <p className="text-[13px] text-muted-foreground">
              {m.kind === "magic" ? "Te mandamos un enlace a tu correo, lo tocas y entras. Sin contraseña."
                : !m.removable ? "Es la única manera que tienes de entrar. Agrega otra antes de quitar esta."
                : m.lastAt ? `Última vez: ${haceCuanto(m.lastAt)}` : "Todavía no has entrado por aquí"}
            </p>
            {m.kind !== "magic" && (
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {m.kind === "google"
                  ? <Button size="sm" variant="outline" className="flex-1" disabled={linking} onClick={() => linkGoogle(m.identityId)} aria-label={`Cambiar cuenta de Google ${m.detail}`}>{linking ? <Spinner /> : <ArrowRightLeft />} Cambiar</Button>
                  : <Button size="sm" variant="outline" className="flex-1" onClick={() => setPwOpen(true)} aria-label="Cambiar contraseña"><KeyRound /> Cambiar</Button>}
                {removeBtn(m)}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button size="sm"><Plus /> Agregar otra forma de entrar</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-60">
            {!account.has_password && <DropdownMenuItem onSelect={() => setPwOpen(true)}><KeyRound /> Crear una contraseña</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => linkGoogle()}><Mail /> {gs.length ? "Conectar otra cuenta de Google" : "Conectar mi cuenta de Google"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {gs.length > 0 && <Button size="sm" variant="outline" onClick={() => setMoveOpen(true)}><Wand2 /> Mi correo de Google ya no lo uso</Button>}
        <p className="text-[13px] text-muted-foreground sm:ml-auto sm:text-right">Sesiones abiertas y actividad de seguridad en <Link className="text-link underline" href="/ajustes?tab=cuenta"><Settings className="inline size-3" /> Ajustes › Tu cuenta</Link> · Dos pasos en <Link className="text-link underline" href="/ajustes?tab=seguridad">Seguridad</Link>.</p>
      </div>

      <EmailChangeDialog open={emailOpen} onOpenChange={setEmailOpen} current={account.email ?? ""} onDone={refresh} />
      <ResponsiveDialog open={pwOpen} onOpenChange={setPwOpen} title={account.has_password ? "Cambiar tu contraseña" : "Crear una contraseña"}
        description={account.has_password ? "Escribe la contraseña nueva. Las sesiones abiertas siguen abiertas." : `Así entras con ${account.email} y esta contraseña, aunque dejes de usar tu cuenta de Google.`}>
        <PasswordForm create={!account.has_password} onDone={() => { setPwOpen(false); refresh() }} />
      </ResponsiveDialog>
      {moveOpen && <MoveAccountDialog open={moveOpen} onOpenChange={setMoveOpen} account={account} onDone={refresh}
        onCreatePassword={() => setPwOpen(true)} onLinkGoogle={(o) => linkGoogle(o)}
        onRemoveGoogle={(id) => { const m = methods.find((x) => x.identityId === id); if (m) setConfirm(m) }} />}
      <Confirm open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} danger
        title={confirm?.kind === "google" ? `¿Quitar la cuenta de Google ${confirm.detail}?` : "¿Quitar tu contraseña?"}
        action={confirm?.kind === "google" ? "Quitar cuenta de Google" : "Quitar contraseña"}
        desc={confirm?.kind === "google" ? "Ya no podrás entrar con esa cuenta de Google. Tus datos siguen en tu cuenta de Mirai y puedes volver a conectarla cuando quieras." : "Ya no podrás entrar con tu correo y contraseña; entrarás con Google. Puedes crear otra contraseña cuando quieras."}
        onConfirm={() => { const m = confirm; setConfirm(null); if (m) remove(m) }} />
      <Confirm open={!!offerOld} onOpenChange={(o) => !o && setOfferOld(null)} danger
        title={`¿Quitar tu cuenta de Google anterior (${offerOld?.detail ?? ""})?`} action="Quitar la anterior"
        desc="Ya conectamos tu cuenta de Google nueva. Si ya no usas la anterior, quítala para entrar solo con la nueva. También puedes dejar las dos."
        onConfirm={() => { const m = offerOld; setOfferOld(null); if (m) remove(m) }} />
      <Confirm open={reauth} onOpenChange={setReauth} title="Vuelve a entrar para confirmar que eres tú" action="Volver a entrar"
        desc="Hace rato entraste a Mirai. Por seguridad, vuelve a entrar y te traemos de nuevo a esta pantalla." onConfirm={reenter} />
    </Panel>
  )
}
