"use client"

import Link from "next/link"
import { ArrowRight, Check, Crown, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { FEATURES, FEATURE_LIST, GRATIS_INCLUYE, ahorroAnual, precio } from "@/lib/plans"
import { usePlans } from "@/features/planes/premium"

const FUNCIONES = [
  { iso: "balance", t: "Tu quincena clara", d: "Cuánto entra, cuánto sale y cuánto te queda, quincena por quincena." },
  { iso: "me-deben", t: "Préstamos sin enredos", d: "Lo que te deben y lo que debes, con cuotas, intereses y avisos de pago." },
  { iso: "metas", t: "Metas y fondo de emergencia", d: "Ahorra para lo que quieres con retos y logros que te motivan." },
  { iso: "renta", t: "La DIAN sin estrés", d: "Calendario fiscal y declaración de renta estimada con las normas vigentes." },
  { iso: "consejero", t: "Un consejero que te entiende", d: "Pregúntale antes de comprar o endeudarte: responde con tus números." },
  { iso: "familia", t: "Las cuentas de la casa, juntas", d: "Invita a tu familia, maneja mesadas y gastos compartidos." },
]

function Precios() {
  const { data: p } = usePlans()
  const ahorro = p ? ahorroAnual(p.mes, p.anio) : null
  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <Card className="gap-4 p-6 shadow-card ring-0">
        <h3 className="text-xl font-semibold">Gratis</h3>
        <p className="text-3xl font-bold">$0 <span className="text-base font-normal text-muted-foreground">para siempre</span></p>
        <ul className="grid gap-2">{GRATIS_INCLUYE.map((t) => <li key={t} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t}</li>)}</ul>
        <Button size="lg" variant="outline" asChild><Link href="/registro">Crear cuenta gratis</Link></Button>
      </Card>
      <Card className="gap-4 p-6 shadow-card ring-2 ring-amber-400">
        <h3 className="flex items-center gap-2 text-xl font-semibold"><Crown className="size-5 text-amber-500" /> Premium</h3>
        <div>
          <p className="text-3xl font-bold">{p ? precio(p.mes) : "…"} <span className="text-base font-normal text-muted-foreground">al mes</span></p>
          {p && ahorro && <p className="text-sm text-muted-foreground">O {precio(p.anio)} al año ({ahorro.meses} meses gratis). Para todo tu hogar.</p>}
        </div>
        <ul className="grid gap-2">{FEATURE_LIST.map((k) => <li key={k} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-amber-500" /><span><b>{FEATURES[k].label}.</b> {FEATURES[k].desc}</span></li>)}<li className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-amber-500" />Sin anuncios</li></ul>
        <Button size="lg" asChild><Link href="/registro">Empieza gratis y pásate cuando quieras</Link></Button>
      </Card>
    </div>
  )
}

/** Página pública de Mirai (visitantes sin sesión): qué es, qué hace, cuánto cuesta. */
export function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold"><IsoIcon k="mirai" size={32} /> Mirai</Link>
        <nav className="flex items-center gap-2"><Button variant="ghost" asChild><Link href="/login">Entrar</Link></Button><Button asChild><Link href="/registro">Crear cuenta</Link></Button></nav>
      </header>
      <main className="mx-auto grid max-w-6xl gap-20 px-4 pt-8 pb-20 sm:px-6">
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="grid gap-5">
            <p className="w-fit rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-link backdrop-blur dark:bg-white/10">Hecho en Colombia 🇨🇴 · 未来 significa “futuro”</p>
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">Tus finanzas en orden, sin saber de finanzas.</h1>
            <p className="text-lg text-muted-foreground">Mirai organiza tu quincena, tus deudas, tus metas y tus impuestos en palabras simples. Para ti y para toda tu familia.</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild><Link href="/registro">Crear cuenta gratis <ArrowRight /></Link></Button>
              <Button size="lg" variant="outline" asChild><Link href="/login">Ya tengo cuenta</Link></Button>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 text-success" /> Tus datos cifrados, nunca los vendemos. Sin tarjeta para empezar.</p>
          </div>
          <div className="grid grid-cols-3 gap-3" aria-hidden>
            {["balance", "metas", "consejero", "me-deben", "renta", "familia"].map((k, i) => (
              <Card key={k} className={`grid aspect-square place-items-center shadow-card ring-0 ${i % 2 ? "translate-y-6" : ""}`}><IsoIcon k={k} size={64} /></Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6">
          <div className="grid gap-2 text-center"><h2 className="text-3xl font-bold">Todo lo que necesitas para tu plata</h2><p className="text-muted-foreground">Sin jerga: cada sección te explica cómo funciona.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONES.map((f) => (
              <Card key={f.t} className="gap-3 p-5 shadow-card ring-0"><IsoIcon k={f.iso} size={44} /><h3 className="font-semibold">{f.t}</h3><p className="text-sm text-muted-foreground">{f.d}</p></Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6" id="planes">
          <div className="grid gap-2 text-center"><h2 className="text-3xl font-bold">Planes</h2><p className="text-muted-foreground">Lo básico es gratis para siempre. Premium cuando quieras más.</p></div>
          <Precios />
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} Mirai · Engynex</p>
          <nav className="flex gap-4"><Link href="/legal/terminos" className="hover:underline">Términos</Link><Link href="/legal/privacidad" className="hover:underline">Privacidad</Link></nav>
        </div>
      </footer>
    </div>
  )
}
