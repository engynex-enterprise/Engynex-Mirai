"use client"

import { BrandLogo } from "@/components/mirai/brand-logo"
import { brandFor } from "@/lib/brands"
import { Illustration } from "@/components/mirai/illustration"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useQuery } from "@/lib/query"
import { EyeOff, LifeBuoy, Moon, Plus } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Icon } from "@/components/mirai/icon"
import { Kbd } from "@/components/ui/kbd"
import { TONE, type IconTone } from "@/components/mirai/tone-icon"
import { cn } from "@/lib/utils"
import { PAGES, PAGE_TABS } from "@/lib/nav"
import { fmtDate, fmtMoney } from "@/lib/format"
import { loanTipo, tipoDef, tiposDe } from "@/lib/domain/loan-tipos"

/** Palabras extra de cada sección (la descripción de su pestaña: "gastos hormiga", "Netflix"…). */
const TAB_DESC = new Map(Object.values(PAGE_TABS).flat().map((t) => [t.id, t.desc]))
import { apiRows } from "@/lib/api/book-rows"
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

/** Un resultado de registro del libro: [clave, texto que se busca, título, detalle, ícono, color, enlace]. */
type Hit = { k: string; v: string; t: string; sub?: string; icon: string; tone: IconTone; href: string; brand?: string | null }
type Group = { heading: string; hits: Hit[] }

/** Agregar una deuda o un préstamo de un tipo ya escogido (?nuevo=<tipo>, lo lee features/loans/loans-view.tsx). */
const LOAN_ADDS = [...tiposDe("pagar").map((t) => ({ ...t, href: `/le-debo?nuevo=${t.value}`, k: "Deuda" })), ...tiposDe("cobrar").filter((t) => t.value !== "otro").map((t) => ({ ...t, href: `/me-deben?nuevo=${t.value}`, k: "Préstamo" }))]

const n = (v: unknown) => Number(v ?? 0)

/** Arma los grupos de registros del libro que el buscador muestra (todos los módulos). */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Fetch = (t: string, cols: string, lim?: number, order?: { column: string; ascending: boolean }) => Promise<any[]>

/**
 * Por el CRUD genérico de la API (GET /v1/books/:b/t/:tabla). Sin relaciones embebidas: los nombres de los préstamos
 * se completan con contactos, entidades y proveedores (que ya se piden).
 */
const fromApi = (bookId: string): Fetch => (t, cols, lim = 200, order) =>
  apiRows<any>(bookId, t, { select: cols, ...(order ? { order } : {}) }).then((r) => r.slice(0, lim)).catch(() => [])

async function searchIndex(bookId: string): Promise<Group[]> {
  const by = fromApi(bookId)
  const [c, l0, f, g, pr, su, tc, me, en, inv, de, ac, ev] = await Promise.all([
    by("contacts", "id,nombre,ciudad"),
    by("loans", "id,kind,tipo,concepto,fiado,prenda,entity_id,contact_id,provider_id"),
    by("fixed_expenses", "id,nombre,valor"),
    by("expenses", "id,descripcion,fecha,valor", 150, { column: "fecha", ascending: false }),
    by("providers", "id,nombre,tipo,activo"),
    by("subscriptions", "id,nombre,valor,activa"),
    by("credit_cards", "id,nombre"),
    by("goals", "id,nombre,objetivo"),
    by("entities", "id,nombre,tipo"),
    by("investments", "id,nombre,tipo"),
    by("wishlist", "id,nombre,precio"),
    by("assets", "id,nombre,valor"),
    by("calendar_events", "id,titulo,fecha", 100),
  ])
  const named = (list: any[], id: unknown) => { const x = id ? list.find((y) => y.id === id) : null; return x ? { nombre: x.nombre } : null }
  const l = l0.map((x) => ({ ...x, contacts: named(c, x.contact_id), entities: named(en, x.entity_id), providers: named(pr, x.provider_id) }))
  const money = (v: unknown) => fmtMoney(n(v))
  return [
    { heading: "Contactos", hits: c.map((x: any) => ({ k: x.id, v: `contacto ${x.nombre} ${x.ciudad ?? ""}`, t: x.nombre, sub: x.ciudad, icon: "user", tone: "blue", href: `/contactos?id=${x.id}` })) },
    { heading: "Préstamos y deudas", hits: l.map((x: any) => {
      const name = x.contacts?.nombre ?? x.entities?.nombre ?? x.providers?.nombre ?? "Préstamo", tipo = tipoDef(loanTipo(x))?.corto ?? ""
      const cobrar = x.kind === "cobrar"
      return { k: x.id, v: `${cobrar ? "préstamo me debe" : "deuda le debo"} ${tipo} ${name} ${x.concepto ?? ""}`, t: name, sub: `${cobrar ? "Me debe" : "Le debo"}${tipo ? ` · ${tipo}` : ""}${x.concepto ? ` · ${x.concepto}` : ""}`, icon: cobrar ? "hand-coins" : "landmark", tone: cobrar ? "green" : "red", href: `/${cobrar ? "me-deben" : "le-debo"}?id=${x.id}` }
    }) },
    { heading: "Tarjetas de crédito", hits: tc.map((x: any) => ({ k: x.id, v: `tarjeta de credito ${x.nombre}`, t: x.nombre, sub: "Tarjeta", icon: "credit-card", tone: "red", brand: brandFor(x.nombre), href: "/tarjetas" })) },
    { heading: "Gastos fijos", hits: f.map((x: any) => ({ k: x.id, v: `fijo ${x.nombre}`, t: x.nombre, sub: money(x.valor), icon: "house", tone: "amber", brand: brandFor(x.nombre), href: `/fijos?id=${x.id}` })) },
    { heading: "Suscripciones", hits: su.map((x: any) => ({ k: x.id, v: `suscripcion ${x.nombre}`, t: x.nombre, sub: `${money(x.valor)}${x.activa === false ? " · pausada" : ""}`, icon: "repeat", tone: "violet", brand: brandFor(x.nombre), href: "/suscripciones" })) },
    { heading: "Proveedores", hits: pr.map((x: any) => ({ k: x.id, v: `proveedor ${x.nombre} ${x.tipo ?? ""}`, t: x.nombre, sub: x.tipo || "Proveedor", icon: "store", tone: "amber", brand: brandFor(x.nombre), href: `/proveedores?id=${x.id}` })) },
    { heading: "Metas", hits: me.map((x: any) => ({ k: x.id, v: `meta ahorro ${x.nombre}`, t: x.nombre, sub: `Meta de ${money(x.objetivo)}`, icon: "piggy-bank", tone: "green", href: "/metas" })) },
    { heading: "Inversiones", hits: inv.map((x: any) => ({ k: x.id, v: `inversion ${x.nombre} ${x.tipo ?? ""}`, t: x.nombre, sub: x.tipo?.toUpperCase?.() === "CDT" ? "CDT" : x.tipo, icon: "trending-up", tone: "violet", brand: brandFor(x.nombre), href: "/inversiones" })) },
    { heading: "Cuentas y bienes", hits: ac.map((x: any) => ({ k: x.id, v: `cuenta bien activo ${x.nombre}`, t: x.nombre, sub: money(x.valor), icon: "wallet", tone: "green", brand: brandFor(x.nombre), href: "/balance" })) },
    { heading: "Bancos y entidades", hits: en.map((x: any) => ({ k: x.id, v: `entidad banco ${x.nombre} ${x.tipo ?? ""}`, t: x.nombre, sub: x.tipo, icon: "landmark", tone: "navy", brand: brandFor(x.nombre), href: "/ajustes?tab=ents" })) },
    { heading: "Lista de deseos", hits: de.map((x: any) => ({ k: x.id, v: `deseo ${x.nombre}`, t: x.nombre, sub: money(x.precio), icon: "heart", tone: "red", href: "/deseos" })) },
    { heading: "Recordatorios y fechas", hits: ev.map((x: any) => ({ k: x.id, v: `recordatorio fecha ${x.titulo}`, t: x.titulo, sub: x.fecha ? fmtDate(x.fecha) : undefined, icon: "calendar", tone: "blue", href: "/calendario" })) },
    { heading: "Gastos recientes", hits: g.map((x: any) => ({ k: x.id, v: `gasto ${x.descripcion} ${x.fecha}`, t: x.descripcion || "Gasto", sub: `${x.fecha ? fmtDate(x.fecha) : ""} · ${money(x.valor)}`, icon: "receipt", tone: "gray", href: `/gastos?mes=${String(x.fecha).slice(0, 7)}` })) },
  ].filter((gr) => gr.hits.length) as Group[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Buscador global (Ctrl/⌘ K): secciones, todos los registros del libro (gastos, deudas, tarjetas, metas…), ayuda y acciones. */
export function CommandPalette() {
  const open = useShell((s) => s.search)
  const setOpen = useShell((s) => s.setSearch)
  const router = useRouter()
  const bookId = useBookId()
  const { resolvedTheme, setTheme } = useTheme()
  const { data } = useQuery({ queryKey: ["b", bookId, "search-index"], enabled: open, staleTime: 60_000, queryFn: () => searchIndex(bookId) })
  const go = (href: string) => { setOpen(false); router.push(href) }
  const setHelp = useShell((s) => s.setHelp)
  // Cierra el buscador y luego abre el Centro de ayuda (dos ventanas a la vez bloquean los clics).
  const help = (k: string) => { setOpen(false); setTimeout(() => setHelp(k), 150) }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar en Mirai" description="Secciones, gastos, deudas, tarjetas, metas, proveedores y más">
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
        {data?.map((gr) => (
          <CommandGroup key={gr.heading} heading={gr.heading}>
            {gr.hits.map((h) => (
              <CommandItem key={h.k} value={`${h.v} ${h.k}`} onSelect={() => go(h.href)}>
                {h.brand ? <BrandLogo k={h.brand} size={28} /> : <Glyph name={h.icon} tone={h.tone} />} <span className="min-w-0 truncate">{h.t}</span>
                {h.sub ? <span className="ml-auto shrink-0 text-xs text-muted-foreground" data-money={/\$/.test(h.sub) || undefined}>{h.sub}</span> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="Centro de ayuda">
          <CommandItem value="centro de ayuda soporte como funciona manual" onSelect={() => help("@")}><Glyph tone="violet"><LifeBuoy /></Glyph> Abrir el Centro de ayuda <span className="ml-auto text-xs text-muted-foreground">?</span></CommandItem>
          {HELP_ITEMS.map(([k, label, icon, words]) => (
            <CommandItem key={k} value={`ayuda ${label} ${words}`} onSelect={() => help(k)}><Glyph name={icon} tone="violet" /> {label}</CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          {ADD_ITEMS.map((a) => (
            <CommandItem key={a.href} value={`agregar nuevo ${a.label} ${a.hint} ${a.words ?? ""}`} onSelect={() => go(a.href)}>
              <Glyph tone="navy"><Plus /></Glyph> Agregar {a.label.toLowerCase()}
            </CommandItem>
          ))}
          {LOAN_ADDS.map((t) => (
            <CommandItem key={t.href} value={`agregar ${t.k} ${t.label} ${t.corto} ${t.desc}`} onSelect={() => go(t.href)}>
              <Glyph name={t.icon} tone="navy" /> Agregar {t.k.toLowerCase()}: {t.label.toLowerCase()}
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
