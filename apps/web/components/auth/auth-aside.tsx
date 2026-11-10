"use client"

// Panel izquierdo de las pantallas de acceso (solo escritorio). Cambia según la pantalla: entrar muestra cómo se ve tu
// plata al volver; registrarte, los 3 pasos para empezar y lo que trae el plan gratis; recuperar o cambiar la clave,
// los pasos y consejos de seguridad; verificar e invitación, lo suyo. Las tarjetas de ejemplo son ilustrativas
// (aria-hidden): no son datos de nadie.
import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, KeyRound, LockKeyhole, MailCheck, ShieldCheck, Smartphone, Users } from "lucide-react"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { cn } from "@/lib/utils"

type Variante = "login" | "registro" | "recuperar" | "verificacion" | "invitacion"

function varianteDe(path: string): Variante {
  if (path.startsWith("/registro")) return "registro"
  if (path.startsWith("/recuperar") || path.startsWith("/actualizar-clave")) return "recuperar"
  if (path.startsWith("/verificacion")) return "verificacion"
  if (path.startsWith("/invitacion")) return "invitacion"
  return "login"
}

const COPY: Record<Variante, { eyebrow: string; titulo: string; texto: string }> = {
  login: { eyebrow: "Qué bueno verte de nuevo", titulo: "Tu plata, justo donde la dejaste.", texto: "Entra y mira en un vistazo cuánto te queda, qué pagos vienen y cómo van tus metas." },
  registro: { eyebrow: "Gratis para empezar", titulo: "En pocos minutos sabes cuánto te queda cada quincena.", texto: "Sin saber de finanzas y sin tarjeta de crédito. Te acompañamos paso a paso." },
  recuperar: { eyebrow: "Recupera tu acceso", titulo: "Tranquilo: tu información sigue segura.", texto: "Te enviamos un enlace a tu correo para que crees una clave nueva. Tus datos no se tocan." },
  verificacion: { eyebrow: "Un paso más", titulo: "Protegemos tu cuenta como a tu billetera.", texto: "La verificación en dos pasos hace que nadie entre aunque conozca tu clave." },
  invitacion: { eyebrow: "Te invitaron a un hogar", titulo: "Lleven las cuentas de la casa, juntos.", texto: "Cada persona con su rol: ven lo mismo, registran lo suyo y Mirai les avisa los movimientos de la familia." },
}

const CONFIANZA = [
  { icon: LockKeyhole, t: "Datos cifrados" },
  { icon: ShieldCheck, t: "Ley 1581 · Habeas Data" },
  { icon: Users, t: "Para toda la familia" },
]

/** Tarjeta de vidrio del panel. */
function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl bg-white/[.08] p-4 shadow-[0_10px_40px_rgba(0,0,0,.25)] ring-1 ring-white/15 backdrop-blur-md", className)}>{children}</div>
}

/** Entrar: una vista previa ilustrativa de lo que encuentras al volver. */
function VistaPrevia() {
  const barras = [38, 52, 44, 66, 58, 74, 62]
  return (
    <div className="relative mt-8 h-[300px]" aria-hidden>
      <Glass className="absolute top-0 left-0 w-[290px]">
        <p className="text-xs text-white/65">Te queda este mes</p>
        <p className="mt-1 font-heading text-3xl font-semibold tracking-tight">$ 1.240.000</p>
        <div className="mt-3 flex h-14 items-end gap-1.5">
          {barras.map((h, i) => <span key={i} className={cn("w-full rounded-t-md", i === barras.length - 1 ? "bg-[#9EDB4E]" : "bg-white/25")} style={{ height: `${h}%` }} />)}
        </div>
      </Glass>
      <Glass className="absolute top-[128px] right-0 w-[240px] animate-[float_7s_ease-in-out_infinite] motion-reduce:animate-none">
        <div className="flex items-center gap-3">
          <IsoIcon k="recordatorios" size={34} />
          <div className="min-w-0">
            <p className="text-xs text-white/65">Próximo pago · en 3 días</p>
            <p className="truncate font-semibold">Arriendo · $ 1.200.000</p>
          </div>
        </div>
      </Glass>
      <Glass className="absolute bottom-0 left-10 w-[260px]">
        <div className="flex items-center gap-3">
          <IsoIcon k="metas" size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/65">Meta · Viaje a Cartagena</p>
            <div className="mt-1.5 h-2 rounded-full bg-white/15"><div className="h-2 w-[68%] rounded-full bg-[#9EDB4E]" /></div>
          </div>
          <span className="text-sm font-semibold">68 %</span>
        </div>
      </Glass>
    </div>
  )
}

/** Pasos numerados con una línea que los une. */
function Pasos({ items }: { items: { k: string; t: string; d: string }[] }) {
  return (
    <ol className="relative mt-8 grid gap-5 before:absolute before:top-6 before:bottom-6 before:left-6 before:w-px before:bg-white/20">
      {items.map((p, i) => (
        <li key={p.t} className="relative flex gap-4">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
            <IsoIcon k={p.k} size={28} />
            <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-[#9EDB4E] text-[11px] font-bold text-[#1F2B4B]">{i + 1}</span>
          </span>
          <div className="pt-0.5">
            <p className="font-semibold">{p.t}</p>
            <p className="text-sm text-white/70">{p.d}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Registro() {
  const gratis = ["Ingresos y gastos", "Gastos fijos y deudas", "Metas de ahorro", "Recordatorios de pagos", "Tu familia en el mismo libro"]
  return (
    <>
      <Pasos items={[
        { k: "perfil", t: "Crea tu cuenta", d: "Con tu correo o con Google. Te pedimos lo justo." },
        { k: "ingresos", t: "Anota lo que entra y lo que sale", d: "A mano, con una foto de la factura o importando tu extracto." },
        { k: "flujo", t: "Mirai te dice cuánto te queda", d: "Y qué pagar primero, cuánto ahorrar y cuándo vencen tus cuentas." },
      ]} />
      <Glass className="mt-8">
        <p className="text-xs font-semibold tracking-wide text-[#9EDB4E] uppercase">Incluido en el plan gratis</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {gratis.map((g) => <li key={g} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[13px]"><Check className="size-3.5 text-[#9EDB4E]" aria-hidden />{g}</li>)}
        </ul>
      </Glass>
    </>
  )
}

function Recuperar() {
  return (
    <>
      <Pasos items={[
        { k: "correo", t: "Escribe tu correo", d: "El mismo con el que entras a Mirai." },
        { k: "notificaciones", t: "Abre el enlace que te enviamos", d: "Si no lo ves en unos minutos, revisa spam o promociones." },
        { k: "seguridad", t: "Crea una clave nueva", d: "Larga y fácil de recordar para ti, difícil para los demás." },
      ]} />
      <Glass className="mt-8">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-[#9EDB4E]" aria-hidden /> Para cuidarte</p>
        <ul className="mt-2 grid gap-1.5 text-sm text-white/75">
          <li className="flex gap-2"><KeyRound className="mt-0.5 size-4 shrink-0 text-white/50" aria-hidden />Mirai nunca te pide tu clave por WhatsApp, llamada ni correo.</li>
          <li className="flex gap-2"><MailCheck className="mt-0.5 size-4 shrink-0 text-white/50" aria-hidden />El enlace sirve una sola vez y por poco tiempo.</li>
          <li className="flex gap-2"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-white/50" aria-hidden />Al cambiarla, se cierran las sesiones abiertas en otros equipos.</li>
        </ul>
      </Glass>
    </>
  )
}

function Verificacion() {
  return (
    <Glass className="mt-8 flex items-center gap-4">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10"><Smartphone className="size-7 text-[#9EDB4E]" aria-hidden /></span>
      <p className="text-sm text-white/80">Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator…) y escribe el código de 6 números que ves para Mirai.</p>
    </Glass>
  )
}

function Invitacion() {
  return (
    <Pasos items={[
      { k: "familia", t: "Un mismo libro para la casa", d: "Ingresos, gastos y deudas de todos, sin hojas de cálculo." },
      { k: "seguridad", t: "Cada quien con su rol", d: "Dueño, editor, registra sus gastos o solo mira." },
      { k: "notificaciones", t: "Se enteran al instante", d: "Cuando alguien registra algo, a los demás les llega el aviso." },
    ]} />
  )
}

/** Contenido según la pantalla (lee la ruta: va dentro de <Suspense>, ver AuthAside). */
function Contenido() {
  const v = varianteDe(usePathname() ?? "")
  const c = COPY[v]
  const quieto = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={v} className="relative z-10 my-auto max-w-[30rem] py-10" data-testid="auth-aside" data-variante={v}
        initial={quieto ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={quieto ? undefined : { opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: "easeOut" }}>
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#9EDB4E] uppercase ring-1 ring-white/15">{c.eyebrow}</p>
        <h1 className="mt-4 font-heading text-4xl leading-tight font-semibold text-balance">{c.titulo}</h1>
        <p className="mt-3 text-[15px] text-white/75">{c.texto}</p>
        {v === "login" ? <VistaPrevia /> : v === "registro" ? <Registro /> : v === "recuperar" ? <Recuperar /> : v === "verificacion" ? <Verificacion /> : <Invitacion />}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Panel izquierdo de /login, /registro, /recuperar y demás pantallas de acceso (solo en pantallas grandes). El marco
 * (fondo, logo y sellos) sale de una vez; el contenido de cada pantalla, apenas se conoce la ruta.
 */
export function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-[linear-gradient(150deg,#1F2B4B,#253A57_50%,#2E5B33)] p-12 text-white lg:flex lg:flex-col">
      {/* Cuadrícula muy suave y brillo de la marca: dan profundidad sin distraer. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden />
      <div className="pointer-events-none absolute -top-32 -right-24 size-[460px] rounded-full bg-[#9EDB4E]/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-24 size-[380px] rounded-full bg-[#3F7A1E]/40 blur-3xl" aria-hidden />

      <Link href="/" className="relative z-10 flex w-fit items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none">
        <IsoIcon k="mirai" size={44} />
        <div>
          <p className="text-xl font-semibold tracking-tight">Mirai</p>
          <p className="text-sm text-white/70">未来 · Tu futuro financiero</p>
        </div>
      </Link>

      <Suspense fallback={<div className="my-auto" />}>
        <Contenido />
      </Suspense>

      <ul className="relative z-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-5 text-sm text-white/75">
        {CONFIANZA.map(({ icon: I, t }) => (
          <li key={t} className="flex items-center gap-1.5"><I className="size-4 text-[#9EDB4E]" aria-hidden />{t}</li>
        ))}
      </ul>
    </aside>
  )
}
