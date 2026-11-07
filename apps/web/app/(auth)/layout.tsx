import Link from "next/link"
import { LockKeyhole, ShieldCheck, Users } from "lucide-react"
import { IsoIcon } from "@/components/mirai/iso-icon"

/** Isotipos que flotan arriba a la derecha del panel (sin tapar el texto de abajo). */
const FLOAT = ["ingresos", "metas", "calendario", "inversiones", "renta"]

/** Por qué Mirai, en palabras simples (el mismo tono de la portada). */
const BENEFICIOS = [
  { k: "flujo", t: "Sabes cuánto te queda", d: "Ingresos, gastos y deudas en una sola cifra, quincena a quincena." },
  { k: "metas", t: "Ahorras con un plan", d: "Metas con fecha y cuánto separar cada mes para llegar." },
  { k: "renta", t: "Tu renta sin enredos", d: "Te avisamos si debes declarar y cuándo vence, con los valores de la DIAN." },
]

const CONFIANZA = [
  { icon: LockKeyhole, t: "Datos cifrados" },
  { icon: ShieldCheck, t: "Ley 1581 · Habeas Data" },
  { icon: Users, t: "Para toda la familia" },
]

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(150deg,#1F2B4B,#253A57_55%,#2E5B33)] p-12 text-white lg:flex lg:flex-col">
        {/* Brillo suave de la marca (lima) detrás de los isotipos */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-[420px] rounded-full bg-[#9EDB4E]/15 blur-3xl" aria-hidden />
        <Link href="/" className="relative z-10 flex w-fit items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none">
          <IsoIcon k="mirai" size={44} />
          <div>
            <p className="text-xl font-semibold tracking-tight">Mirai</p>
            <p className="text-sm text-white/70">未来 · Tu futuro financiero</p>
          </div>
        </Link>

        <div className="relative z-10 mt-auto max-w-md">
          <h1 className="font-heading text-4xl leading-tight font-semibold text-balance">
            Tus finanzas en orden, explicadas en palabras simples.
          </h1>
          <ul className="mt-8 grid gap-5">
            {BENEFICIOS.map((b) => (
              <li key={b.k} className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
                  <IsoIcon k={b.k} size={30} />
                </span>
                <div>
                  <p className="font-semibold">{b.t}</p>
                  <p className="text-sm text-white/70">{b.d}</p>
                </div>
              </li>
            ))}
          </ul>
          <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-5 text-sm text-white/75">
            {CONFIANZA.map(({ icon: I, t }) => (
              <li key={t} className="flex items-center gap-1.5"><I className="size-4 text-[#9EDB4E]" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-[42%]" aria-hidden>
          {FLOAT.map((k, i) => (
            <div
              key={k}
              className="absolute animate-[float_6s_ease-in-out_infinite] opacity-90 drop-shadow-xl motion-reduce:animate-none"
              style={{ top: `${18 + ((i * 23) % 60)}%`, right: `${6 + ((i * 19) % 40)}%`, animationDelay: `${i * 0.7}s` }}
            >
              <IsoIcon k={k} size={52 + (i % 3) * 12} />
            </div>
          ))}
        </div>
      </aside>

      <main className="flex flex-col bg-[radial-gradient(ellipse_at_top,var(--color-brand-soft),transparent_60%)] px-4 py-10 sm:px-8">
        <div className="m-auto w-full max-w-[420px]">
          <Link href="/" className="mb-8 flex w-fit items-center gap-3 lg:hidden">
            <IsoIcon k="mirai" size={40} />
            <div>
              <p className="text-lg font-semibold">Mirai</p>
              <p className="text-xs text-muted-foreground">Tu futuro financiero</p>
            </div>
          </Link>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">{children}</div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Al usar Mirai aceptas los <Link href="/legal/terminos" className="underline-offset-2 hover:underline">Términos</Link> y la{" "}
            <Link href="/legal/privacidad" className="underline-offset-2 hover:underline">Política de datos</Link>. Hecho en Colombia.
          </p>
        </div>
      </main>
    </div>
  )
}
