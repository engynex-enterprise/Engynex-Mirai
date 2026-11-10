import { PAGES } from "@/lib/nav"
import { describe, expect, it } from "vitest"
import {
  ATAJOS, buildHelpIndex, cmpVer, faqId, filtrarFaq, filtrarNovedades, groupHits, helpKey, initialStack, manualSecciones,
  novedadesNoLeidas, normText, pageIdFromPath, parseHelpKey, relacionados, releaseKey, searchHelp, tokens, SECCIONES_VECINAS, type HelpRoute,
} from "./centro-ayuda"
import { APP_VER, FAQ, GUIDES, RELEASES, type Release } from "./ayuda"
import { GLOSARIO } from "./glosario"
import { LECCIONES, avancePorNivel, insignias, siguienteLeccion } from "./academia"

describe("rutas del panel", () => {
  it("una sección abre su ayuda y la portada queda debajo", () => {
    expect(parseHelpKey("gastos")).toEqual({ v: "pagina", id: "gastos" })
    expect(initialStack("gastos")).toEqual([{ v: "inicio" }, { v: "pagina", id: "gastos" }])
    expect(initialStack("@")).toEqual([{ v: "inicio" }])
    expect(parseHelpKey(null)).toBeNull()
  })
  it("las vistas internas van con @ y aceptan un argumento", () => {
    expect(parseHelpKey("@novedades")).toEqual({ v: "novedades" })
    expect(parseHelpKey("@guia:nomina")).toEqual({ v: "guia", id: "nomina" })
    expect(parseHelpKey("@opinion:error")).toEqual({ v: "opinion", tipo: "error" })
    expect(parseHelpKey("@noexiste")).toEqual({ v: "inicio" })
    expect(parseHelpKey("@guia")).toEqual({ v: "inicio" })
  })
  it("helpKey y parseHelpKey son inversas", () => {
    const rs: HelpRoute[] = [{ v: "inicio" }, { v: "pagina", id: "balance" }, { v: "faq" }, { v: "faq", id: "x" }, { v: "glosario", id: "uvt" }, { v: "soporte" }, { v: "leccion", id: "renta" }, { v: "opinion", tipo: "elogio" }]
    for (const r of rs) expect(parseHelpKey(helpKey(r))).toEqual(r)
  })
  it("la ruta actual se traduce a la sección con ayuda", () => {
    expect(pageIdFromPath("/gastos")).toBe("gastos")
    expect(pageIdFromPath("/le-debo?id=1")).toBe("le-debo")
    expect(pageIdFromPath("/")).toBe("inicio")
    expect(pageIdFromPath("/sistema-diseno")).toBeNull()
  })
})

describe("búsqueda global", () => {
  const docs = buildHelpIndex()
  it("indexa todo el contenido", () => {
    const kinds = new Set(docs.map((d) => d.kind))
    for (const k of ["pagina", "faq", "guia", "glosario", "leccion", "novedad", "atajo"]) expect(kinds.has(k as never)).toBe(true)
    expect(docs.filter((d) => d.kind === "faq")).toHaveLength(FAQ.length)
    expect(docs.filter((d) => d.kind === "glosario")).toHaveLength(GLOSARIO.length)
  })
  it("ignora tildes, mayúsculas y palabras vacías", () => {
    expect(normText("¿Cómo DECLARO <b>Renta</b>?")).toBe("como declaro renta")
    expect(tokens("cómo le doy acceso a mi contador")).toEqual(["le", "doy", "acceso", "contador"])
    expect(tokens("de la")).toEqual(["de", "la"])
  })
  it("encuentra el término del glosario primero cuando se busca su nombre", () => {
    const hits = searchHelp(docs, "uvt")
    expect(hits[0]).toMatchObject({ kind: "glosario", id: "uvt" })
  })
  it("todas las palabras deben aparecer (búsqueda Y)", () => {
    const hits = searchHelp(docs, "contador acceso")
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) expect(normText(`${h.title} ${h.text} ${h.sub ?? ""}`)).toMatch(/contador/)
    expect(searchHelp(docs, "contador zzzzqq")).toEqual([])
  })
  it("4x1000 encuentra el término escrito con ×", () => {
    expect(searchHelp(docs, "4x1000").some((h) => h.id === "gmf")).toBe(true)
  })
  it("filtra por tipo, limita y agrupa en orden", () => {
    const hits = searchHelp(docs, "quincena", { kinds: ["guia", "glosario"], limit: 3 })
    expect(hits.length).toBeLessThanOrEqual(3)
    expect(hits.every((h) => h.kind === "guia" || h.kind === "glosario")).toBe(true)
    const g = groupHits(searchHelp(docs, "quincena"))
    expect(g.map((x) => x.kind)).toEqual([...g.map((x) => x.kind)].sort((a, b) => ["pagina", "faq", "guia", "glosario", "leccion", "novedad", "atajo"].indexOf(a) - ["pagina", "faq", "guia", "glosario", "leccion", "novedad", "atajo"].indexOf(b)))
  })
  it("sin texto no devuelve nada", () => expect(searchHelp(docs, "   ")).toEqual([]))
})

describe("novedades", () => {
  const rel: Release[] = [
    { v: "5.10", f: "", t: "Diez", items: [["new", "A", "a"], ["fix", "B", "b"]] },
    { v: "5.4", f: "", t: "Cuatro", items: [["imp", "C", "c"]] },
    { v: "5.3", f: "", t: "Tres", items: [["new", "D", "d"]] },
  ]
  it("compara versiones como números", () => {
    expect(cmpVer("5.10", "5.4")).toBeGreaterThan(0)
    expect(cmpVer("5.4", "5.4")).toBe(0)
    expect(cmpVer("4.9", "5.0")).toBeLessThan(0)
  })
  it("una persona nueva solo tiene sin leer la versión actual", () => {
    expect(novedadesNoLeidas({ releases: rel, seen: null, appVer: "5.10" })).toEqual(["5.10·A", "5.10·B"])
  })
  it("cuenta las versiones posteriores a la última vista y descuenta las leídas", () => {
    expect(novedadesNoLeidas({ releases: rel, seen: "5.3", appVer: "5.10", leidas: ["5.10·B"] })).toEqual(["5.10·A", "5.4·C"])
  })
  it("con los datos reales, la versión actual tiene novedades", () => {
    expect(novedadesNoLeidas({ seen: APP_VER }).length).toBe(RELEASES.find((r) => r.v === APP_VER)!.items.length)
  })
  it("filtra por tipo, texto y no leídas", () => {
    expect(filtrarNovedades(rel, { kind: "fix" }).map((r) => r.v)).toEqual(["5.10"])
    expect(filtrarNovedades(rel, { q: "c" }).flatMap((r) => r.items.map((i) => i[1]))).toEqual(["C"])
    expect(filtrarNovedades(rel, { soloNoLeidas: true, noLeidas: [releaseKey("5.3", "D")] }).map((r) => r.v)).toEqual(["5.3"])
  })
})

describe("preguntas, manual y relacionados", () => {
  it("filtra preguntas por categoría y texto", () => {
    const r = filtrarFaq(FAQ, { q: "contador" })
    expect(r.some((f) => f.q === "¿Cómo le doy acceso a mi contador?")).toBe(true)
    expect(filtrarFaq(FAQ, { cat: "DIAN" }).every((f) => f.c === "DIAN")).toBe(true)
  })
  it("cada pregunta tiene un id estable y único", () => {
    const ids = FAQ.map(faqId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(faqId({ q: "¿Cómo le doy acceso a mi contador?" })).toBe("como-le-doy-acceso-a-mi-contador")
  })
  it("el manual agrupa por sección del menú y busca", () => {
    const all = manualSecciones()
    expect(all[0].sec).toBe("General")
    expect(all.flatMap((s) => s.items).some((i) => i.id === "gastos")).toBe(true)
    const r = manualSecciones("empeño")
    expect(r.flatMap((s) => s.items).length).toBeLessThan(all.flatMap((s) => s.items).length)
  })
  it("relaciona preguntas, guías, lecciones y términos con una sección", () => {
    const r = relacionados("ingresos")
    expect(r.guias.some((g) => g.id === "nomina")).toBe(true)
    expect(r.lecciones.some((l) => l.id === "nomina")).toBe(true)
    expect(relacionados("renta").terminos.some((t) => t.id === "uvt")).toBe(true)
  })
  it("las secciones sin enlaces desde la ayuda tienen secciones relacionadas que existen", () => {
    const ids = new Set(PAGES.map((p) => p.id))
    for (const [k, v] of Object.entries(SECCIONES_VECINAS)) {
      expect(ids.has(k), k).toBe(true)
      for (const x of v) expect(ids.has(x), `${k} → ${x}`).toBe(true)
    }
    for (const id of ["puesta", "dashboard", "consejero", "proveedores", "correo", "importar", "me-deben", "personas", "informes", "retos", "logros", "familia", "mesadas", "compartidos", "deseos", "contador", "indicadores", "reportes", "automatizaciones", "suscripciones"])
      expect(relacionados(id).secciones.length, id).toBeGreaterThan(0)
    expect(relacionados("dashboard").secciones[0]).toMatchObject({ id: "balance", href: "/balance" })
  })
  it("las guías nuevas van primero y se conservan las de la v4", () => {
    expect(GUIDES[0].id).toBe("primeros-pasos")
    expect(GUIDES.some((g) => g.t === "Registrar tu primer gasto")).toBe(true)
  })
  it("los atajos tienen id único", () => {
    expect(new Set(ATAJOS.map((a) => a.id)).size).toBe(ATAJOS.length)
  })
  it("los términos del glosario tienen id único y los enlaces de las lecciones existen", () => {
    expect(new Set(GLOSARIO.map((g) => g.id)).size).toBe(GLOSARIO.length)
    const ids = new Set(GLOSARIO.map((g) => g.id))
    for (const l of LECCIONES) for (const g of l.glosario ?? []) expect(ids.has(g), `${l.id} → ${g}`).toBe(true)
    for (const t of GLOSARIO) for (const v of t.ver ?? []) expect(ids.has(v), `${t.id} → ${v}`).toBe(true)
  })
})

describe("academia", () => {
  it("avance por nivel e insignias", () => {
    expect(avancePorNivel([]).every((n) => n.hechas === 0 && n.total > 0)).toBe(true)
    expect(insignias([]).every((i) => !i.ok)).toBe(true)
    const basicas = LECCIONES.filter((l) => (l.nivel ?? "basico") === "basico").map((l) => l.id)
    const ins = insignias(basicas)
    expect(ins.find((i) => i.id === "primer-paso")?.ok).toBe(true)
    expect(ins.find((i) => i.id === "basico")?.ok).toBe(true)
    expect(ins.find((i) => i.id === "graduado")?.ok).toBe(false)
    expect(insignias(LECCIONES.map((l) => l.id)).every((i) => i.ok)).toBe(true)
  })
  it("sugiere la siguiente lección empezando por el nivel básico", () => {
    expect(siguienteLeccion([])?.nivel ?? "basico").toBe("basico")
    expect(siguienteLeccion(LECCIONES.map((l) => l.id))).toBeNull()
  })
})
