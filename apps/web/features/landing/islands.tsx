"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { Menu, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { NAV_LINKS } from "./content"

const subscribe = () => () => {}
/** true solo en el navegador (el tema real no se conoce en el servidor). */
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false)

/** Cambia entre modo claro y oscuro. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const dark = mounted && resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  )
}

/** Menú de anclas en el celular. */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú"><Menu aria-hidden /></Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(320px,85vw)] p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2"><IsoIcon k="mirai" size={28} /> Mirai</SheetTitle>
          <SheetDescription>Finanzas personales y familiares para Colombia.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Secciones de la página" className="grid gap-1 px-3">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-medium hover:bg-hover">{l.label}</a>
          ))}
        </nav>
        <div className="mt-auto grid gap-2 border-t p-4">
          <Button size="lg" asChild><Link href="/registro">Crear cuenta gratis</Link></Button>
          <Button size="lg" variant="outline" asChild><Link href="/login">Entrar</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
