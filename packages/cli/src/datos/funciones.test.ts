// Las funciones nuevas: base de datos, buscador, endpoints, pruebas, git y despliegue.
import { describe, expect, it } from "vitest"
import { consultar, URL_LOCAL } from "./base.ts"
import { buscar, indice, normalizar, resumenIndice } from "./buscador.ts"
import { endpoints, porModulo } from "./endpoints.ts"
import { paqueteDe } from "./git.ts"
import { leerSalida, SUITES } from "./pruebas.ts"

describe("base de datos: frenos de solo lectura", () => {
  const prohibidas = [
    "delete from expenses",
    "DROP TABLE expenses",
    "update profiles set nombre='x'",
    "insert into expenses (id) values ('1')",
    "truncate expenses",
    "alter table expenses add column x int",
    "grant all on expenses to public",
  ]

  it("rechaza todo lo que escriba o cambie algo", async () => {
    for (const sql of prohibidas) {
      const r = await consultar(sql)
      expect(r.ok, sql).toBe(false)
    }
  })

  it("rechaza varias sentencias en una (así no se cuela un delete al final)", async () => {
    const r = await consultar("select 1; delete from expenses")
    expect(r.ok).toBe(false)
  })

  it("rechaza lo que no empiece por una lectura", async () => {
    expect((await consultar("begin")).ok).toBe(false)
    expect((await consultar("")).ok).toBe(false)
  })

  it("apunta a la base local, nunca a producción", () => {
    expect(URL_LOCAL).toMatch(/localhost|127\.0\.0\.1/)
    expect(URL_LOCAL).not.toMatch(/engynex|amazonaws|supabase/)
  })
})

describe("buscador global", () => {
  it("quita tildes para buscar como la gente escribe", () => {
    expect(normalizar("Préstamos")).toBe("prestamos")
    expect(normalizar("TARJETAS DE CRÉDITO")).toBe("tarjetas de credito")
  })

  it("indexa de todo: endpoints, módulos, secciones, servicios, comandos y ambientes", () => {
    const tipos = new Set(indice().map((x) => x.tipo))
    for (const t of ["Endpoint", "Módulo de la API", "Sección de la web", "Servicio", "Comando", "Ambiente", "Paquete", "Tecnología"]) {
      expect(tipos, t).toContain(t)
    }
    expect(indice().length).toBeGreaterThan(300)
  })

  it("encuentra con tilde y sin tilde igual", () => {
    expect(buscar("prestamo").length).toBeGreaterThan(0)
    expect(buscar("préstamo").length).toBeGreaterThan(0)
  })

  it("pone primero lo que pega en el título", () => {
    const r = buscar("tarjeta")
    expect(r.length).toBeGreaterThan(0)
    expect(normalizar(r[0].titulo)).toContain("tarjeta")
  })

  it("exige que aparezcan TODAS las palabras", () => {
    expect(buscar("tarjeta credito").length).toBeGreaterThan(0)
    expect(buscar("tarjeta zzzzz")).toEqual([])
  })

  it("no busca con menos de dos letras (traería todo)", () => {
    expect(buscar("a")).toEqual([])
    expect(buscar("")).toEqual([])
  })

  it("cada hallazgo sabe a qué panel lleva", () => {
    for (const h of buscar("gasto", 10)) expect(h.panel.length).toBeGreaterThan(2)
  })

  it("el resumen cuadra con el índice", () => {
    expect(resumenIndice().reduce((a, r) => a + r.cuantos, 0)).toBe(indice().length)
  })
})

describe("endpoints", () => {
  it("salen del contrato de verdad, no de una lista a mano", () => {
    const e = endpoints()
    expect(e.length).toBeGreaterThan(200)
    expect(e.some((x) => x.ruta === "/v1/me")).toBe(true)
  })

  it("marca cuáles escriben", () => {
    for (const e of endpoints()) expect(e.escribe).toBe(e.metodo !== "GET")
  })

  it("saca los parámetros de la ruta", () => {
    const conParams = endpoints().find((e) => e.ruta.includes("/books/:bookId/"))
    expect(conParams?.parametros).toContain("bookId")
  })

  it("los agrupa por módulo sin perder ninguno", () => {
    expect(porModulo().reduce((a, m) => a + m.endpoints.length, 0)).toBe(endpoints().length)
  })
})

describe("lectura de la salida de las pruebas", () => {
  it("entiende a Vitest cuando todo pasa", () => {
    const r = leerSalida(["", " Test Files  5 passed (5)", "      Tests  50 passed (50)", ""])
    expect(r).toMatchObject({ pasaron: 50, fallaron: 0, archivos: 5 })
  })

  it("entiende a Vitest cuando algo falla y recoge cuáles", () => {
    const r = leerSalida([" Test Files  1 failed | 3 passed (4)", "      Tests  2 failed | 41 passed (43)", "   × dibuja el logo 109ms", "   × muestra los comandos 3134ms"])
    expect(r?.fallaron).toBe(2)
    expect(r?.pasaron).toBe(41)
    expect(r?.fallas.map((f) => f.titulo)).toEqual(["dibuja el logo", "muestra los comandos"])
  })

  it("entiende a Playwright", () => {
    const r = leerSalida(["  3 failed", "  1) f03-gastos.spec.ts:42:5 › crea un gasto", "  28 passed (2.1m)"])
    expect(r?.fallaron).toBe(3)
    expect(r?.pasaron).toBe(28)
    expect(r?.fallas[0]).toMatchObject({ archivo: "f03-gastos.spec.ts:42", titulo: "crea un gasto" })
  })

  it("dice que no entendió, en vez de inventar un cero", () => {
    expect(leerSalida(["cualquier cosa", "que no es una batería"])).toBeNull()
  })

  it("toda batería trae su comando y cuánto tarda", () => {
    for (const s of SUITES) {
      expect(s.cmd).toBe("pnpm")
      expect(s.args.length).toBeGreaterThan(0)
      expect(s.tarda.length).toBeGreaterThan(4)
    }
  })
})

describe("cambios (git)", () => {
  it("sabe a qué paquete pertenece cada archivo", () => {
    expect(paqueteDe("apps/web/lib/nav.ts")).toBe("apps/web")
    expect(paqueteDe("packages/domain/src/totals.ts")).toBe("packages/domain")
    expect(paqueteDe("infra/local/stack.mjs")).toBe("infra")
    expect(paqueteDe("CLAUDE.md")).toBe("(raíz)")
  })
})
