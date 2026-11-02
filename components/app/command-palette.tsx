"use client"

import { Illustration } from "@/components/mirai/illustration"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import { EyeOff, LifeBuoy, Moon, Plus } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Icon } from "@/components/mirai/icon"
import { Kbd } from "@/components/ui/kbd"
import { TONE, type IconTone } from "@/components/mirai/tone-icon"
import { cn } from "@/lib/utils"
import { PAGES, PAGE_TABS } from "@/lib/nav"

/** Palabras extra de cada sección (la descripción de su pestaña: "gastos hormiga", "Netflix"…). */
const TAB_DESC = new Map(Object.values(PAGE_TABS).flat().map((t) => [t.id, t.desc]))
import { createClient } from "@/utils/supabase/client"
import { useShell } from "./shell-store"
import { useBookId } from "./app-context"
import { ADD_ITEMS } from "./add-menu"
import { togglePrivacy } from "./privacy"

/** Accesos del Centro de ayuda en el buscador: [clave del panel, texto, ícono, palabras extra]. */
const HELP_ITEMS: [string, string, string, string][] = [
  ["@glosario", "Glosario financiero", "library", "uvt smmlv retencion prima cesantias cdt usura 4x1000 pila"],
  ["@guias", "Guías paso a paso", "list-checks", "instructivo como registrar nomina quincena"],
  ["@soporte", "Contactar soporte", "life-buoy", "caso problema ayuda escribir"],
  ["@atajos", "Atajos de teclado", "command", "teclas teclado"],
  ["@estado", "Estado del servicio", "activity", "version conexion servidor caido"],
]

/** Ícono del resultado en un cuadro con el color de su grupo (secciones, contactos, préstamos…). */
function Glyph({ name, tone = "gray", children }: { name?: string; tone?: IconTone; children?: React.ReactNode }) {
  return <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md [&>svg]:size-4", TONE[tone])}>{children ?? <Icon name={name ?? "circle"} />}</span>
}

/** Buscador global (Ctrl/⌘ K): secciones, contactos, préstamos y gastos fijos. */
export function CommandPalette() {
  const open = useShell((s) => s.search)
  const setOpen = useShell((s) => s.setSearch)
  const router = useRouter()
  const bookId = useBookId()
  const { resolvedTheme, setTheme } = useTheme()
  const { data } = useQuery({
    queryKey: ["b", bookId, "search-index"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const sb = createClient()
      const [c, l, f] = await Promise.all([
        sb.from("contacts").select("id,nombre,ciudad").eq("book_id", bookId).is("deleted_at", null).limit(200),
        sb.from("loans").select("id,kind,concepto,contacts(nombre),entities(nombre)").eq("book_id", bookId).is("deleted_at", null).limit(200),
        sb.from("fixed_expenses").select("id,nombre").eq("book_id", bookId).is("deleted_at", null).limit(200),
      ])
      return { contacts: c.data ?? [], loans: l.data ?? [], fixed: f.data ?? [] }
    },
  })
  const go = (href: string) => { setOpen(false); router.push(href) }
  const setHelp = useShell((s) => s.setHelp)
  // Cierra el buscador y luego abre el Centro de ayuda (dos ventanas a la vez bloquean los clics).
  const help = (k: string) => { setOpen(false); setTimeout(() => setHelp(k), 150) }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar en Mirai" description="Secciones, contactos, préstamos y gastos fijos">
      <Command loop>
      <CommandInput placeholder="Buscar secciones, contactos, préstamos…" />
      <CommandList>
        <CommandEmpty><span className="grid justify-items-center gap-1 py-2"><Illustration k="sin-resultados" width={150} /><span className="font-semibold">No encontramos eso</span><span className="text-xs text-muted-foreground">Prueba con otra palabra.</span></span></CommandEmpty>
        <CommandGroup heading="Secciones">
          {PAGES.map((p) => (
            <CommandItem key={p.id} value={`${p.label} ${p.group?.label ?? ""} ${TAB_DESC.get(p.id) ?? ""}`} onSelect={() => go(p.href)}>
              <Glyph name={p.icon} tone="brand" /> {p.label}
              <span className="ml-auto text-xs text-muted-foreground">{p.group?.label ?? p.section}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {!!data?.contacts.length && (
          <CommandGroup heading="Contactos">
            {data.contacts.map((c) => (
              <CommandItem key={c.id} value={`contacto ${c.nombre}`} onSelect={() => go(`/contactos?id=${c.id}`)}>
                <Glyph name="user" tone="blue" /> {c.nombre} <span className="ml-auto text-xs text-muted-foreground">{c.ciudad}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!data?.loans.length && (
          <CommandGroup heading="Préstamos">
            {data.loans.map((l) => {
              const name = l.contacts?.nombre ?? l.entities?.nombre ?? "Préstamo"
              return (
                <CommandItem key={l.id} value={`préstamo ${name} ${l.concepto}`} onSelect={() => go(`/${l.kind === "cobrar" ? "me-deben" : "le-debo"}?id=${l.id}`)}>
                  <Glyph name={l.kind === "cobrar" ? "hand-coins" : "landmark"} tone={l.kind === "cobrar" ? "green" : "red"} /> {name}
                  <span className="ml-auto text-xs text-muted-foreground">{l.kind === "cobrar" ? "Me debe" : "Le debo"}{l.concepto ? ` · ${l.concepto}` : ""}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
        {!!data?.fixed.length && (
          <CommandGroup heading="Gastos fijos">
            {data.fixed.map((f) => (
              <CommandItem key={f.id} value={`fijo ${f.nombre}`} onSelect={() => go(`/fijos?id=${f.id}`)}>
                <Glyph name="house" tone="amber" /> {f.nombre}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Centro de ayuda">
          <CommandItem value="centro de ayuda soporte como funciona manual" onSelect={() => help("@")}><Glyph tone="violet"><LifeBuoy /></Glyph> Abrir el Centro de ayuda <span className="ml-auto text-xs text-muted-foreground">?</span></CommandItem>
          {HELP_ITEMS.map(([k, label, icon, words]) => (
            <CommandItem key={k} value={`ayuda ${label} ${words}`} onSelect={() => help(k)}><Glyph name={icon} tone="violet" /> {label}</CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          {ADD_ITEMS.map((a) => (
            <CommandItem key={a.href} value={`agregar ${a.label}`} onSelect={() => go(a.href)}>
              <Glyph tone="navy"><Plus /></Glyph> Agregar {a.label.toLowerCase()}
            </CommandItem>
          ))}
          <CommandItem value="modo oscuro claro tema" onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); setOpen(false) }}>
            <Glyph tone="navy"><Moon /></Glyph> Cambiar a modo {resolvedTheme === "dark" ? "claro" : "oscuro"}
          </CommandItem>
          <CommandItem value="ocultar mostrar montos privacidad" onSelect={() => { togglePrivacy(); setOpen(false) }}>
            <Glyph tone="navy"><EyeOff /></Glyph> Ocultar o mostrar montos
          </CommandItem>
        </CommandGroup>
      </CommandList>
      {/* Pie con los atajos, como en los buscadores de Microsoft 365 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground max-sm:hidden" aria-hidden>
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> moverte</span>
        <span className="flex items-center gap-1"><Kbd>Enter</Kbd> abrir</span>
        <span className="flex items-center gap-1"><Kbd>Esc</Kbd> cerrar</span>
      </div>
      </Command>
    </CommandDialog>
  )
}
