"use client"

// Ajustes › Reglas de importación: "si la descripción contiene la palabra, va a esta categoría". Se aplican al importar
// extractos, al leer correos del banco y al escribir gastos. Si varias coinciden, gana la más específica (matchRule).
// Aquí se prueban, se ve cuántos gastos toca cada una, se aplican a lo ya registrado y se sugieren desde el historial.
import { useMemo, useState } from "react"
import { ArrowRight, Check, FlaskConical, Lightbulb, Plus, Sparkles } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/mirai/combobox"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { Icon } from "@/components/mirai/icon"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { StatusPill } from "@/components/mirai/status-pill"
import { IconButton } from "@/components/mirai/tip"
import { toast } from "@/components/mirai/toast"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { categoryOptions, useCategories, useKeywordRules } from "@/features/catalogs/hooks"
import { REGLAS_COMUNES, localCat, matchRule, norm, sugerirReglas, usoReglas, type ReglaUso } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { cn } from "@/lib/utils"
import { SettingSection, SettingStack } from "../ui"
import { AddRow, TextBlur } from "./catalog-ui"

type Rule = Row<"keyword_rules">
type Cat = Row<"categories">
type Aplicar = { titulo: string; cambios: { id: string; category_id: string; antes: string | null; antesSrc: string | null; desc: string }[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const TOOLBAR_FROM = 6
const SIN_USO: ReglaUso = { total: 0, distintos: [], masEspecificas: [], repetida: false }

/** "Si contiene «palabra»" con la parte que coincide resaltada dentro de la descripción. */
function Resaltado({ texto, palabra }: { texto: string; palabra: string }) {
  const i = norm(texto).indexOf(norm(palabra))
  // norm quita tildes sin cambiar el largo de las letras comunes; si no calza, se muestra sin resaltar.
  if (i < 0 || norm(texto).length !== texto.length) return <>{texto}</>
  return <>{texto.slice(0, i)}<mark className="rounded-sm bg-brand-soft px-0.5 font-semibold text-foreground">{texto.slice(i, i + palabra.length)}</mark>{texto.slice(i + palabra.length)}</>
}

function CatChip({ cat }: { cat?: Cat }) {
  if (!cat) return <span className="text-muted-foreground">Otros</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
      <EntityLogo icon={cat.icon} seed={cat.nombre} size={22} />
      <span className="truncate">{cat.nombre}</span>
    </span>
  )
}

/** Probador: escribe una descripción como sale en el extracto y mira qué categoría le pondría Mirai y por qué. */
function Probador({ rules, cats, history }: { rules: Rule[]; cats: Cat[]; history: Row<"expenses">[] }) {
  const [t, setT] = useState("")
  const d = t.trim()
  const regla = d ? matchRule(d, rules.filter((r) => cats.some((c) => c.id === r.category_id))) : undefined
  const otro = d && !regla ? localCat(d, { rules: [], expenses: history, categories: cats }) : null
  const cat = (id?: string | null) => cats.find((c) => c.id === id)
  return (
    <div className="grid gap-2 rounded-lg border border-dashed bg-muted/40 p-3 sm:p-4">
      <label htmlFor="probar-regla" className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="size-4 text-link" aria-hidden />Prueba una descripción</label>
      <Input id="probar-regla" className="h-10 bg-card" placeholder="Como sale en el extracto (ej. COMPRA POS EXITO CALLE 80)" value={t} maxLength={120} onChange={(e) => setT(e.target.value)} />
      {d && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" role="status" aria-live="polite">
          {regla ? (
            <>
              <span className="text-muted-foreground">Regla</span>
              <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[13px] ring-1 ring-border">{regla.keyword}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
              <CatChip cat={cat(regla.category_id)} />
              <span className="basis-full truncate text-xs text-muted-foreground"><Resaltado texto={d} palabra={regla.keyword} /></span>
            </>
          ) : otro ? (
            <>
              <span className="text-muted-foreground">Ninguna regla. Por {otro.src === "historial" ? "tu historial" : "palabras comunes"} quedaría en</span>
              <CatChip cat={cat(otro.category_id)} />
            </>
          ) : (
            <span className="text-muted-foreground">Ninguna regla coincide: quedaría en <b className="text-foreground">Otros</b> (o la IA, si está activa, propone una).</span>
          )}
        </p>
      )}
    </div>
  )
}

export function Reglas() {
  const { data, isPending } = useKeywordRules()
  const { data: cats = [] } = useCategories()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const save = useSave("keyword_rules")
  const saveExp = useSave("expenses")
  const del = useSoftDelete("keyword_rules", "Regla eliminada")
  const can = useCanEdit()
  const [cat, setCat] = useState("")
  const [nueva, setNueva] = useState("")
  const [aplicar, setAplicar] = useState<Aplicar | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const rules = useMemo(() => data ?? [], [data])

  const catOf = (id: string | null) => cats.find((x) => x.id === id)
  const uso = useMemo(() => usoReglas(rules, history), [rules, history])
  const sugeridas = useMemo(() => {
    // Una regla hacia "Otros" no ayuda: es lo mismo que no tener regla.
    const util = (id: string) => cats.some((c) => c.id === id && norm(c.nombre) !== "otros")
    const desdeGastos = sugerirReglas(history, rules).filter((s) => util(s.category_id))
    if (desdeGastos.length || rules.length) return desdeGastos.map((s) => ({ ...s, comun: false }))
    // Libro nuevo, sin historial ni reglas: las comunes de Colombia cuyas categorías existen.
    return REGLAS_COMUNES.flatMap(([keyword, nombre]) => {
      const c = cats.find((x) => norm(x.nombre) === norm(nombre))
      return c ? [{ keyword, category_id: c.id, veces: 0, comun: true }] : []
    })
  }, [history, rules, cats])

  const usados = useMemo(() => cats.filter((c) => rules.some((r) => r.category_id === c.id)), [cats, rules])
  const filters = useMemo<ListFilter<Rule>[]>(() => [
    { value: "todas", label: "Todas" },
    { value: "pendientes", label: "Con gastos por cambiar", icon: "refresh-cw", match: (r) => (uso.get(r.id)?.distintos.length ?? 0) > 0 },
    ...usados.map((c) => ({ value: c.id, label: c.nombre, icon: c.icon, match: (r: Rule) => r.category_id === c.id })),
  ], [usados, uso])
  const sorts = useMemo<ListSort<Rule>[]>(() => [
    { value: "usadas", label: "Más usadas", by: (a, b) => (uso.get(b.id)?.total ?? 0) - (uso.get(a.id)?.total ?? 0) || a.keyword.localeCompare(b.keyword, "es") },
    { value: "palabra", label: "Palabra (A-Z)", by: (a, b) => a.keyword.localeCompare(b.keyword, "es") },
    { value: "recientes", label: "Más recientes", by: (a, b) => b.created_at.localeCompare(a.created_at) },
  ], [uso])
  const c = useListControls(rules, { text: (r) => `${r.keyword} ${catOf(r.category_id)?.nombre ?? ""}`, filters, sorts })

  if (isPending) return <Skeleton className="h-96 rounded-lg" />
  const opts = categoryOptions(cats)
  const taken = (k: string) => rules.some((r) => norm(r.keyword) === norm(k))
  const coincidenNueva = nueva.trim().length >= 2 ? history.filter((g) => norm(g.descripcion).includes(norm(nueva))).length : 0

  const agregar = (keyword: string, category_id: string) => save.mutateAsync({ keyword: keyword.trim().toLowerCase(), category_id } as never)
  const agregarTodas = async () => {
    const lista = sugeridas.filter((s) => !taken(s.keyword))
    for (const s of lista) await agregar(s.keyword, s.category_id)
    toast.success(`Agregamos ${plural(lista.length, "regla", "reglas")}`)
  }

  /** Gastos ya registrados que cambiarían de categoría con estas reglas. */
  const cambiosDe = (rs: Rule[]) => rs.flatMap((r) => (uso.get(r.id)?.distintos ?? []).flatMap((id) => {
    const g = history.find((x) => x.id === id)
    return g && r.category_id ? [{ id, category_id: r.category_id, antes: g.category_id, antesSrc: g.cat_src, desc: g.descripcion }] : []
  }))
  const pendientesTodas = cambiosDe(rules)

  const confirmarAplicar = async () => {
    if (!aplicar) return
    setAplicando(true)
    const hechos: Aplicar["cambios"] = []
    try {
      for (const x of aplicar.cambios) { await saveExp.mutateAsync({ id: x.id, category_id: x.category_id, cat_src: "regla" } as never); hechos.push(x) }
      toast.success(`${plural(hechos.length, "gasto cambió", "gastos cambiaron")} de categoría`, {
        action: { label: "Deshacer", onClick: () => { for (const x of hechos) saveExp.mutate({ id: x.id, category_id: x.antes, cat_src: x.antesSrc } as never) } },
      })
    } catch { /* el aviso lo muestra la mutación; lo que alcanzó a cambiar queda */ }
    setAplicando(false)
    setAplicar(null)
  }

  return (
    <SettingStack>
      <SettingSection icon="file-up" title="Reglas de importación"
        desc={<>Si la descripción de un movimiento contiene la palabra, queda en esa categoría. Se usan al importar extractos, al leer los correos del banco y al escribir gastos. Si varias coinciden, gana la más específica («uber eats» antes que «uber»). {plural(rules.length, "regla", "reglas")}.</>}
>
        <div className="grid gap-4">
          {pendientesTodas.length > 0 && can && (
            <div className="flex flex-col gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2"><Icon name="refresh-cw" className="mt-0.5 size-4 shrink-0 text-info" />
                <span>{plural(pendientesTodas.length, "gasto que ya registraste queda", "gastos que ya registraste quedan")} en otra categoría según tus reglas.</span></p>
              <Button variant="outline" size="sm" className="shrink-0 bg-card" onClick={() => setAplicar({ titulo: "tus reglas", cambios: pendientesTodas })}>Revisar y aplicar</Button>
            </div>
          )}
          <div className="grid gap-1.5">
            <AddRow placeholder="Si contiene… (ej. exito, rappi, terpel)" disabled={!can} needsExtra={!cat && "Elige la categoría"} taken={taken}
              extra={<div className="sm:w-56"><Combobox value={cat} onChange={setCat} options={opts} placeholder="Categoría" aria-label="Categoría de la regla" /></div>}
              onAdd={async (keyword) => { await agregar(keyword, cat); setNueva("") }} onType={setNueva} />
            {coincidenNueva > 0 && <p className="-mt-2 text-xs text-muted-foreground">Coincide con {plural(coincidenNueva, "gasto que ya registraste", "gastos que ya registraste")}. Después podrás pasarlos a la categoría con «Aplicar».</p>}
          </div>

          <Probador rules={rules} cats={cats} history={history} />

          {sugeridas.length > 0 && can && (
            <section aria-labelledby="reglas-sugeridas" className="grid gap-2.5 rounded-lg bg-brand-soft/60 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 id="reglas-sugeridas" className="flex items-center gap-2 text-sm font-semibold">
                  {sugeridas[0].comun ? <Lightbulb className="size-4 text-link" aria-hidden /> : <Sparkles className="size-4 text-link" aria-hidden />}
                  {sugeridas[0].comun ? "Reglas comunes para empezar" : "Sugerencias desde tus gastos"}
                </h4>
                {sugeridas.length > 1 && <Button variant="ghost" size="sm" onClick={agregarTodas}><Check /> Agregar todas</Button>}
              </div>
              <ul className="flex flex-wrap gap-2" aria-label="Reglas sugeridas">
                {sugeridas.map((s) => {
                  const sc = catOf(s.category_id)
                  return (
                    <li key={s.keyword} className="flex h-10 items-center gap-2 rounded-full bg-card py-1 pr-1 pl-1.5 text-sm shadow-[0_0_0_1px_var(--border)]">
                      <EntityLogo name={s.keyword} icon={sc?.icon} seed={sc?.nombre} size={26} />
                      <span className="font-medium">{s.keyword}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="max-w-32 truncate text-muted-foreground">{sc?.nombre}</span>
                      {s.veces > 0 && <span className="text-xs text-muted-foreground">· {plural(s.veces, "gasto", "gastos")}</span>}
                      <IconButton icon={<Plus />} size="icon-sm" variant="soft" className="rounded-full" label={`Agregar regla ${s.keyword} → ${sc?.nombre ?? ""}`} onClick={() => void agregar(s.keyword, s.category_id)} />
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {!rules.length ? (
            <div className="grid justify-items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-link"><Icon name="file-up" className="size-6" /></span>
              <p className="font-semibold">Aún no tienes reglas</p>
              <p className="max-w-md text-sm text-muted-foreground">Escribe una palabra que aparezca en tus extractos (el nombre del comercio) y elige su categoría. También te proponemos crearlas cuando corriges la categoría de un movimiento al importar.</p>
            </div>
          ) : (
            <div className="grid">
              {rules.length >= TOOLBAR_FROM && <ListToolbar c={c} placeholder="Buscar palabra o categoría" filters={filters} sorts={sorts} className="pb-2" />}
              {!c.rows.length ? <NoResults c={c} /> : (
                <ul className="grid" aria-label="Reglas">
                  <li className="hidden grid-cols-[2.25rem_minmax(0,1fr)_1rem_14rem_minmax(9rem,auto)_2.25rem] gap-2 px-0.5 pb-1 text-xs font-semibold text-muted-foreground sm:grid" aria-hidden>
                    <span /><span>Si contiene</span><span /><span>Va a la categoría</span><span>En tus gastos</span><span />
                  </li>
                  {c.rows.map((r) => {
                    const u = uso.get(r.id) ?? SIN_USO
                    const rc = catOf(r.category_id)
                    const pend = u.distintos.length
                    return (
                      <li key={r.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b py-2.5 last:border-0 sm:grid-cols-[2.25rem_minmax(0,1fr)_1rem_14rem_minmax(9rem,auto)_2.25rem]">
                        <EntityLogo name={r.keyword} icon={rc?.icon} seed={rc?.nombre ?? r.keyword} size={36} />
                        <TextBlur label={`Palabra ${r.keyword}`} value={r.keyword} disabled={!can} className="h-10 font-medium" onSave={(v) => save.mutate({ id: r.id, keyword: v.toLowerCase() } as never)} />
                        <IconButton icon="trash-2" destructive label={`Eliminar regla ${r.keyword}`} className="sm:order-last" disabled={!can} onClick={() => del.mutate({ id: r.id, nombre: r.keyword })} />
                        <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
                        <div className="col-span-3 sm:col-span-1"><Combobox value={r.category_id ?? ""} onChange={(v) => save.mutate({ id: r.id, category_id: v } as never)} options={opts} disabled={!can} aria-label={`Categoría de ${r.keyword}`} /></div>
                        <div className={cn("col-span-3 flex flex-wrap items-center gap-1.5 sm:col-span-1")}>
                          <StatusPill tone={u.total ? "info" : "gray"}
                            hint={u.total ? `«${r.keyword}» decide la categoría de ${plural(u.total, "gasto registrado", "gastos registrados")}.${u.masEspecificas.length ? ` Donde dice «${u.masEspecificas.join("», «")}» gana esa otra regla.` : ""}` : "Todavía ningún gasto registrado tiene esta palabra. Se usará en los próximos."}>
                            {u.total ? plural(u.total, "gasto", "gastos") : "Sin gastos aún"}
                          </StatusPill>
                          {u.repetida && <StatusPill tone="warn" hint="Otra regla tiene la misma palabra. Deja solo una para que no haya dudas.">Repetida</StatusPill>}
                          {pend > 0 && can && (
                            <Button variant="outline" size="xs" className="h-6 rounded-full px-2.5 text-xs" onClick={() => setAplicar({ titulo: `«${r.keyword}»`, cambios: cambiosDe([r]) })}
                              title={`${plural(pend, "gasto con esta palabra tiene", "gastos con esta palabra tienen")} otra categoría`}>
                              Aplicar a {pend}
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </SettingSection>

      <AlertDialog open={!!aplicar} onOpenChange={(o) => !o && !aplicando && setAplicar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar la categoría de {plural(aplicar?.cambios.length ?? 0, "gasto", "gastos")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Según {aplicar?.titulo}, estos gastos que ya registraste quedan en otra categoría. Podrás deshacerlo justo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="grid max-h-56 gap-1.5 overflow-y-auto text-sm" aria-label="Gastos que cambian">
            {aplicar?.cambios.slice(0, 30).map((x) => (
              <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                <span className="truncate">{x.desc}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="max-w-24 truncate line-through">{catOf(x.antes)?.nombre ?? "Sin categoría"}</span>
                  <ArrowRight className="size-3" aria-hidden />
                  <span className="max-w-28 truncate font-medium text-foreground">{catOf(x.category_id)?.nombre}</span>
                </span>
              </li>
            ))}
            {(aplicar?.cambios.length ?? 0) > 30 && <li className="px-2.5 text-xs text-muted-foreground">y {aplicar!.cambios.length - 30} más…</li>}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={aplicando} onClick={(e) => { e.preventDefault(); void confirmarAplicar() }}>
              {aplicando ? "Cambiando…" : "Cambiar categoría"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingStack>
  )
}
