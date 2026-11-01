"use client"

import { Illustration } from "@/components/mirai/illustration"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import { EyeOff, Moon, Plus } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Icon } from "@/components/mirai/icon"
import { PAGES } from "@/lib/nav"
import { createClient } from "@/utils/supabase/client"
import { useShell } from "./shell-store"
import { useBookId } from "./app-context"
import { ADD_ITEMS } from "./add-menu"
import { togglePrivacy } from "./privacy"

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

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar en Mirai" description="Secciones, contactos, préstamos y gastos fijos">
      <Command loop>
      <CommandInput placeholder="Buscar secciones, contactos, préstamos…" />
      <CommandList>
        <CommandEmpty><span className="grid justify-items-center gap-1 py-2"><Illustration k="sin-resultados" width={150} /><span className="font-semibold">No encontramos eso</span><span className="text-xs text-muted-foreground">Prueba con otra palabra.</span></span></CommandEmpty>
        <CommandGroup heading="Secciones">
          {PAGES.map((p) => (
            <CommandItem key={p.id} value={`${p.label} ${p.group?.label ?? ""}`} onSelect={() => go(p.href)}>
              <Icon name={p.icon} /> {p.label}
              <span className="ml-auto text-xs text-muted-foreground">{p.group?.label ?? p.section}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {!!data?.contacts.length && (
          <CommandGroup heading="Contactos">
            {data.contacts.map((c) => (
              <CommandItem key={c.id} value={`contacto ${c.nombre}`} onSelect={() => go(`/contactos?id=${c.id}`)}>
                <Icon name="user" /> {c.nombre} <span className="ml-auto text-xs text-muted-foreground">{c.ciudad}</span>
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
                  <Icon name={l.kind === "cobrar" ? "hand-coins" : "landmark"} /> {name}
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
                <Icon name="house" /> {f.nombre}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          {ADD_ITEMS.map((a) => (
            <CommandItem key={a.href} value={`agregar ${a.label}`} onSelect={() => go(a.href)}>
              <Plus /> Agregar {a.label.toLowerCase()}
            </CommandItem>
          ))}
          <CommandItem value="modo oscuro claro tema" onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); setOpen(false) }}>
            <Moon /> Cambiar a modo {resolvedTheme === "dark" ? "claro" : "oscuro"}
          </CommandItem>
          <CommandItem value="ocultar mostrar montos privacidad" onSelect={() => { togglePrivacy(); setOpen(false) }}>
            <EyeOff /> Ocultar o mostrar montos
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
