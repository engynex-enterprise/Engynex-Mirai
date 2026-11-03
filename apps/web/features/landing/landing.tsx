import { Suspense } from "react"
import Link from "next/link"
import {
  ArrowRight, BadgeCheck, ChevronDown, Crown, EyeOff, FileLock2, KeyRound, Lock, MapPin, PlayCircle, ShieldCheck, UserCheck, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { LEGAL } from "@/lib/legal/config"
import { BADGES, FAQ_LANDING, GRUPOS, NAV_LINKS, PASOS, PROBLEMAS, SEGURIDAD, type Funcion } from "./content"
import { HeroMockup } from "./hero-mockup"
import { FuncionesTabs } from "./funciones-tabs"
import { VersusMirai } from "./vs"
import { DemoQueda } from "./demo"
import { MobileNav, ThemeToggle } from "./islands"
import { Precios, PreciosSkeleton } from "./precios"

const BADGE_ICONS = [Lock, BadgeCheck, MapPin]
const SEG_ICONS = [KeyRound, Users, EyeOff, ShieldCheck, UserCheck, FileLock2]
const COLOMBIA = ["UVT", "Salario mínimo", "Festivos", "Calendario de la DIAN", "TRM", "Tasa de usura", "4×1000", "Prima y cesantías", "Llaves Bre-B", "Nequi y Daviplata"]
const TOTAL_FUNCIONES = GRUPOS.reduce((t, g) => t + g.items.length, 0)

/** Encabezado de cada sección. */
function SectionHead({ eyebrow, title, desc, id }: { eyebrow: string; title: React.ReactNode; desc?: React.ReactNode; id: string }) {
  return (
    <div className="reveal mx-auto grid max-w-3xl gap-3 text-center">
      <p className="mx-auto w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold tracking-wide text-accent-foreground uppercase">{eyebrow}</p>
      <h2 id={id} className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {desc && <p className="text-base text-pretty text-muted-foreground sm:text-lg">{desc}</p>}
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg text-lg font-bold" aria-label="Mirai, inicio">
          <IsoIcon k="mirai" size={32} /> Mirai
        </Link>
        <nav aria-label="Secciones de la página" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground">{l.label}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" className="hidden sm:inline-flex" asChild><Link href="/login">Entrar</Link></Button>
          <Button asChild className="hidden min-[380px]:inline-flex"><Link href="/registro">Crear cuenta gratis</Link></Button>
          <MobileNav />
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="mx-auto grid w-full grid-cols-1 max-w-6xl items-center gap-14 px-4 pt-10 pb-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
      <div className="grid gap-6">
        <p className="w-fit rounded-full border bg-card px-3 py-1 text-sm font-semibold text-link backdrop-blur">Hecho en Colombia · 未来 significa “futuro”</p>
        <h1 id="hero-title" className="text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Tus finanzas en orden, <span className="text-brand-gradient">sin saber de finanzas.</span>
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Mirai junta tu quincena, tus gastos, tus deudas, tus metas y tus impuestos en un solo lugar, te avisa antes de cada pago
          y te dice qué hacer con tu plata. En palabras simples, para ti y para toda tu familia.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" className="h-12 px-6 text-base" asChild><Link href="/registro">Crear cuenta gratis <ArrowRight aria-hidden /></Link></Button>
          <Button size="lg" variant="outline" className="h-12 px-6 text-base" asChild><a href="#como-funciona"><PlayCircle aria-hidden /> Ver cómo funciona</a></Button>
        </div>
        <p className="text-sm text-muted-foreground">Gratis para siempre en lo básico. Sin tarjeta para empezar.</p>
        <ul className="grid gap-3 sm:grid-cols-3" aria-label="Garantías">
          {BADGES.map((b, i) => {
            const I = BADGE_ICONS[i]
            return (
              <li key={b.t} className="flex items-start gap-2.5 rounded-xl border bg-card p-3 backdrop-blur">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success-soft text-success"><I className="size-4" aria-hidden /></span>
                <span className="text-sm leading-tight"><b className="block">{b.t}</b><span className="text-xs text-muted-foreground">{b.d}</span></span>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="pb-6 lg:pb-0"><HeroMockup /></div>
    </section>
  )
}

function Colombia() {
  return (
    <section aria-label="Hecho para Colombia" className="border-y bg-card/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-brand" aria-hidden /> Con las reglas de Colombia:</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {COLOMBIA.map((t) => <li key={t} className="rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">{t}</li>)}
        </ul>
      </div>
    </section>
  )
}

function QueEs() {
  return (
    <section aria-labelledby="que-es-t" id="que-es" className="mx-auto grid w-full grid-cols-1 max-w-6xl scroll-mt-20 gap-12 px-4 sm:px-6">
      <SectionHead
        id="que-es-t"
        eyebrow="Qué es Mirai"
        title="Una app que pone orden en tu plata y te explica todo"
        desc="Mirai es una plataforma de finanzas personales y familiares para Colombia, pensada para quien no sabe de finanzas. Registras lo que entra y lo que sale, y Mirai hace las cuentas, te avisa a tiempo y te dice qué hacer."
      />
      <div className="grid gap-6">
        <h3 className="reveal text-center text-xl font-semibold">Lo que resuelve: lo que le pasa hoy a muchas familias</h3>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PROBLEMAS.map((p) => (
            <li key={p.t} className="reveal grid content-start gap-3 rounded-2xl border bg-card p-5 shadow-card backdrop-blur">
              <IsoIcon k={p.iso} size={44} />
              <h4 className="font-semibold leading-snug">{p.t}</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ComoFunciona() {
  return (
    <section aria-labelledby="como-t" id="como-funciona" className="mx-auto grid w-full grid-cols-1 max-w-6xl scroll-mt-20 gap-10 px-4 sm:px-6">
      <SectionHead id="como-t" eyebrow="Cómo lo resuelve" title="Cuatro pasos y tu plata deja de ser un misterio" desc="No tienes que saber de contabilidad: Mirai hace el trabajo pesado." />
      <ol className="relative grid gap-4 md:grid-cols-4">
        <span aria-hidden className="absolute top-9 right-[12%] left-[12%] hidden h-0.5 bg-[linear-gradient(90deg,var(--brand),transparent_50%,var(--brand))] opacity-40 md:block" />
        {PASOS.map((p) => (
          <li key={p.n} className="reveal relative grid content-start gap-3 rounded-2xl border bg-card p-5 shadow-card backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-hero-gradient text-sm font-bold text-white shadow-card">{p.n}</span>
              <IsoIcon k={p.iso} size={36} />
            </div>
            <h3 className="text-lg font-semibold">{p.t}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{p.d}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TarjetaFuncion({ f }: { f: Funcion }) {
  const I = f.icon
  return (
    // En el celular: ícono a la izquierda (tarjeta compacta); desde sm, ícono arriba.
    <li className="lift flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card backdrop-blur sm:grid sm:content-start sm:p-5">
      {f.iso ? <IsoIcon k={f.iso} size={40} /> : I ? <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><I className="size-5" aria-hidden /></span> : null}
      <div className="grid min-w-0 gap-2">
        <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          {f.t}
          {f.premium && <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[linear-gradient(135deg,#FFD36B,#E08A00)] px-2 text-[11px] font-bold text-white"><Crown className="size-3" aria-hidden />Premium</span>}
        </h4>
        <p className="text-sm leading-relaxed text-muted-foreground">{f.d}</p>
        {f.ej && <p className="rounded-lg bg-muted/70 px-3 py-2 text-xs text-foreground/80"><span className="font-semibold">Ejemplo: </span>{f.ej}</p>}
        {f.nota && <p className="text-xs text-muted-foreground">{f.nota}</p>}
      </div>
    </li>
  )
}

function Funciones() {
  const panels = Object.fromEntries(
    GRUPOS.map((g) => [
      g.id,
      <div key={g.id} className="grid gap-5">
        <h3 className="text-center text-base text-muted-foreground"><span className="font-semibold text-foreground">{g.label}:</span> {g.intro}</h3>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{g.items.map((f) => <TarjetaFuncion key={f.t} f={f} />)}</ul>
      </div>,
    ]),
  )
  return (
    <section aria-labelledby="funciones-t" id="funciones" className="mx-auto grid w-full grid-cols-1 max-w-6xl grid-cols-1 scroll-mt-20 gap-10 px-4 sm:px-6">
      <SectionHead
        id="funciones-t"
        eyebrow="Funciones"
        title="Todo lo que hace Mirai, una a una"
        desc={<>{TOTAL_FUNCIONES} funciones en {GRUPOS.length} grupos. Las que tienen <span className="font-semibold text-amber-600 dark:text-amber-400">Premium</span> son del plan de pago; lo demás es gratis.</>}
      />
      <FuncionesTabs grupos={GRUPOS.map((g) => ({ id: g.id, label: g.label, iso: g.iso, n: g.items.length }))} panels={panels} />
      <p className="text-center text-xs text-muted-foreground">Los ejemplos son ilustrativos.</p>
    </section>
  )
}

function Vs() {
  return (
    <section aria-labelledby="vs-t" id="vs" className="mx-auto grid w-full grid-cols-1 max-w-6xl scroll-mt-20 gap-10 px-4 sm:px-6">
      <SectionHead id="vs-t" eyebrow="Sin Mirai vs con Mirai" title="La misma plata, otra tranquilidad" desc="Situaciones de todos los días. Cambia el interruptor y mira la diferencia." />
      <VersusMirai />
    </section>
  )
}

function Demo() {
  return (
    <section aria-labelledby="demo-t" id="demo" className="mx-auto grid w-full grid-cols-1 max-w-6xl scroll-mt-20 gap-10 px-4 sm:px-6">
      <SectionHead id="demo-t" eyebrow="Pruébalo ya" title="¿Cuánto te queda este mes?" desc="Escribe tus valores y mira cuánto te queda y cuánto se llevan los gastos hormiga. Sin crear cuenta." />
      <DemoQueda />
    </section>
  )
}

function Seguridad() {
  return (
    <section aria-labelledby="seg-t" id="seguridad" className="scroll-mt-20 bg-hero-gradient py-16 text-white sm:py-20">
      <div className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-10 px-4 sm:px-6">
        <div className="reveal mx-auto grid max-w-3xl gap-3 text-center">
          <p className="mx-auto w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide uppercase">Seguridad y privacidad</p>
          <h2 id="seg-t" className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">Tu plata es privada. Tus datos también.</h2>
          <p className="text-base text-white/80 sm:text-lg">Así cuidamos tu información, sin letra pequeña.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SEGURIDAD.map((s, i) => {
            const I = SEG_ICONS[i]
            return (
              <li key={s.t} className="reveal grid content-start gap-3 rounded-2xl border border-white/15 bg-white/8 p-5 backdrop-blur">
                <span className="grid size-10 place-items-center rounded-xl bg-lime text-navy"><I className="size-5" aria-hidden /></span>
                <h3 className="font-semibold">{s.t}</h3>
                <p className="text-sm leading-relaxed text-white/80">{s.d}</p>
              </li>
            )
          })}
        </ul>
        <p className="text-center text-sm text-white/80">
          Lee la <Link href="/legal/privacidad" className="font-semibold text-white underline underline-offset-4">política de tratamiento de datos</Link> y los{" "}
          <Link href="/legal/terminos" className="font-semibold text-white underline underline-offset-4">términos</Link>.
        </p>
      </div>
    </section>
  )
}

function Planes() {
  return (
    <section aria-labelledby="planes-t" id="planes" className="mx-auto grid w-full grid-cols-1 max-w-5xl scroll-mt-20 gap-10 px-4 sm:px-6">
      <SectionHead id="planes-t" eyebrow="Planes" title="Empieza gratis. Pásate a Premium cuando quieras." desc="Lo básico es gratis para siempre. Premium es para todo tu hogar." />
      <Suspense fallback={<PreciosSkeleton />}><Precios /></Suspense>
    </section>
  )
}

function Preguntas() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_LANDING.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }
  return (
    <section aria-labelledby="faq-t" id="preguntas" className="mx-auto grid w-full grid-cols-1 max-w-3xl scroll-mt-20 gap-10 px-4 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SectionHead id="faq-t" eyebrow="Preguntas frecuentes" title="Lo que más nos preguntan" />
      <div className="grid gap-3">
        {FAQ_LANDING.map((f) => (
          <details key={f.q} className="group rounded-2xl border bg-card shadow-card backdrop-blur open:shadow-float">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function CtaFinal() {
  return (
    <section aria-labelledby="cta-t" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="reveal relative overflow-hidden rounded-3xl bg-hero-gradient px-6 py-12 text-center text-white shadow-float sm:px-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 opacity-30 motion-safe:animate-[float_8s_ease-in-out_infinite]"><IsoIcon k="metas" size={160} /></div>
        <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-8 opacity-25 motion-safe:animate-[float_9s_ease-in-out_-4s_infinite]"><IsoIcon k="balance" size={150} /></div>
        <div className="relative mx-auto grid max-w-2xl gap-5">
          <h2 id="cta-t" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Tu futuro financiero empieza con saber cuánto te queda hoy</h2>
          <p className="text-white/80">Crea tu cuenta en un minuto. Puesta en marcha te guía paso a paso.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" className="h-12 bg-lime px-6 text-base text-navy hover:bg-lime/90" asChild><Link href="/registro">Crear cuenta gratis <ArrowRight aria-hidden /></Link></Button>
            <Button size="lg" variant="outline" className="h-12 border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white" asChild><Link href="/login">Ya tengo cuenta</Link></Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const anio = new Date().getFullYear()
  return (
    <footer className="border-t bg-card/60 backdrop-blur">
      <div className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <p className="flex items-center gap-2 text-lg font-bold"><IsoIcon k="mirai" size={28} /> Mirai</p>
          <p className="max-w-xs text-sm text-muted-foreground">Finanzas personales y familiares para Colombia, explicadas en palabras simples. Los cálculos tributarios son estimados.</p>
        </div>
        <nav aria-label="Producto" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Producto</p>
          {[...NAV_LINKS, { href: "#demo", label: "Pruébalo" }, { href: "#seguridad", label: "Seguridad" }].map((l) => <a key={l.href} href={l.href} className="w-fit text-muted-foreground hover:text-foreground hover:underline">{l.label}</a>)}
        </nav>
        <nav aria-label="Cuenta" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Tu cuenta</p>
          <Link href="/registro" className="w-fit text-muted-foreground hover:text-foreground hover:underline">Crear cuenta</Link>
          <Link href="/login" className="w-fit text-muted-foreground hover:text-foreground hover:underline">Entrar</Link>
          <Link href="/recuperar" className="w-fit text-muted-foreground hover:text-foreground hover:underline">Recuperar contraseña</Link>
        </nav>
        <nav aria-label="Legal y contacto" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Legal y contacto</p>
          <Link href="/legal/terminos" className="w-fit text-muted-foreground hover:text-foreground hover:underline">Términos y condiciones</Link>
          <Link href="/legal/privacidad" className="w-fit text-muted-foreground hover:text-foreground hover:underline">Tratamiento de datos (Ley 1581)</Link>
          {LEGAL.email
            ? <a href={`mailto:${LEGAL.email}`} className="w-fit text-muted-foreground hover:text-foreground hover:underline">{LEGAL.email}</a>
            : <p className="text-muted-foreground">Soporte dentro de la app: Centro de ayuda › Soporte.</p>}
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">© {anio} Mirai · Engynex. Hecho en Colombia.</p>
      </div>
    </footer>
  )
}

/** Página pública de Mirai (visitantes sin sesión): qué es, qué resuelve, cómo, funciones, VS, demo, planes y FAQ. */
export function Landing() {
  return (
    <div id="landing" className="min-h-dvh overflow-x-clip">
      <a href="#contenido" className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Saltar al contenido</a>
      <Header />
      <main id="contenido" className="grid grid-cols-1 gap-20 pb-20 sm:gap-28">
        <div className="grid grid-cols-1 gap-10">
          <Hero />
          <Colombia />
        </div>
        <QueEs />
        <ComoFunciona />
        <Funciones />
        <Vs />
        <Demo />
        <Seguridad />
        <Planes />
        <Preguntas />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  )
}
