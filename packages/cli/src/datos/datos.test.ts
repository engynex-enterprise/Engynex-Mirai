import { describe, expect, it } from "vitest"
import { clasificarVariables, variablesDe } from "./compose.ts"
import { COMANDOS } from "./comandos.ts"
import { infraestructura } from "./infra.ts"
import { arquitectura, modulosApi, seccionesWeb } from "./modulos.ts"
import { monorepo, stack, versionDe } from "./repo.ts"
import { variablesEsperadas } from "./salud-local.ts"
import { esNombreSensible, presencia, taparSecretos } from "./secretos.ts"
import { estadoPorMs, peorEstado } from "./tipos.ts"

describe("secretos", () => {
  it("tapa el valor de una variable sensible y deja las demás", () => {
    expect(taparSecretos("BETTER_AUTH_SECRET=abc123xyz")).toBe("BETTER_AUTH_SECRET=«oculto»")
    expect(taparSecretos("POSTGRES_PASSWORD='mi clave'")).toBe("POSTGRES_PASSWORD=«oculto»")
    expect(taparSecretos("MIRAI_ENV=produccion")).toBe("MIRAI_ENV=produccion")
    expect(taparSecretos("PORT=8080")).toBe("PORT=8080")
  })

  it("tapa secretos reconocibles aunque no tengan nombre al lado", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.QWxiZXJ0bzEyMzQ1Njc4OTA"
    expect(taparSecretos(`token ${jwt} fin`)).toBe("token «oculto» fin")
    expect(taparSecretos("sk-abcdefghijklmnopqrstuvwx")).toBe("«oculto»")
    expect(taparSecretos("ghp_abcdefghijklmnopqrstuvwxyz1234")).toBe("«oculto»")
  })

  it("tapa la contraseña dentro de una URL de base de datos pero deja ver el resto", () => {
    const tapado = taparSecretos("postgres://mirai_app:claveSuperSecreta@db:5432/mirai")
    expect(tapado).not.toContain("claveSuperSecreta")
    expect(tapado).toContain("mirai_app")
    expect(tapado).toContain("db:5432/mirai")
  })

  it("reconoce los nombres sensibles", () => {
    for (const n of ["BETTER_AUTH_SECRET", "MIRAI_APP_PASSWORD", "AI_GATEWAY_API_KEY", "CRON_SECRET", "ENCRYPTION_KEY"]) {
      expect(esNombreSensible(n), n).toBe(true)
    }
    for (const n of ["MIRAI_DOMINIO", "PORT", "LOG_LEVEL", "S3_REGION"]) {
      expect(esNombreSensible(n), n).toBe(false)
    }
  })

  it("de una variable solo informa si está, nunca su valor", () => {
    expect(presencia("lo-que-sea")).toBe("definida")
    expect(presencia(undefined)).toBe("falta")
    expect(presencia("")).toBe("falta")
  })
})

describe("semáforo", () => {
  it("manda el peor estado", () => {
    expect(peorEstado(["ok", "aviso", "error"])).toBe("error")
    expect(peorEstado(["ok", "aviso"])).toBe("aviso")
    expect(peorEstado(["ok", "ok"])).toBe("ok")
    expect(peorEstado(["apagado", "apagado"])).toBe("apagado")
    expect(peorEstado(["apagado", "ok"])).toBe("ok")
  })

  it("clasifica por tiempo de respuesta con umbrales de servidor remoto", () => {
    expect(estadoPorMs(120)).toBe("ok")
    expect(estadoPorMs(1199)).toBe("ok")
    expect(estadoPorMs(1500)).toBe("aviso")
    expect(estadoPorMs(4000)).toBe("error")
  })
})

describe("compose", () => {
  it("separa las variables obligatorias de las que tienen respaldo", () => {
    const { exigidas, opcionales } = variablesDe('A: ${UNO:?}\nB: ${DOS:-algo}\nC: ${TRES}\nD: ${UNO:?}')
    expect(exigidas).toEqual(["UNO"])
    expect(opcionales).toEqual(["DOS", "TRES"])
  })

  it("una variable exigida en un lado no queda listada como opcional", () => {
    const { exigidas, opcionales } = variablesDe('${X:-respaldo} y ${X:?}')
    expect(exigidas).toEqual(["X"])
    expect(opcionales).not.toContain("X")
  })

  it("marca cuáles variables guardan un secreto", () => {
    const c = clasificarVariables(["MIRAI_DOMINIO", "ENCRYPTION_KEY"])
    expect(c).toEqual([
      { nombre: "MIRAI_DOMINIO", secreta: false },
      { nombre: "ENCRYPTION_KEY", secreta: true },
    ])
  })
})

describe("lectura del repositorio", () => {
  it("lee el stack con versiones reales", () => {
    const s = stack()
    expect(s.filas.length).toBeGreaterThan(10)
    const next = s.filas.find((f) => f.id === "next")
    expect(next?.valor).toMatch(/^\d+\./)
    expect(next?.detalle).not.toBe("")
    // Toda fila del stack trae su explicación en español.
    for (const f of s.filas) expect(f.detalle.length, f.nombre).toBeGreaterThan(5)
  })

  it("encuentra la versión de una dependencia y no inventa las que no hay", () => {
    expect(versionDe("react")).toMatch(/^\d+\./)
    expect(versionDe("no-existe-este-paquete")).toBeUndefined()
  })

  it("lista los paquetes del monorepo con su responsabilidad", () => {
    const m = monorepo()
    const ids = m.filas.map((f) => f.id)
    expect(ids).toContain("apps/web")
    expect(ids).toContain("apps/api")
    expect(ids).toContain("packages/domain")
  })

  it("lee los módulos de la API del directorio, no de una lista escrita a mano", () => {
    const mods = modulosApi()
    expect(mods.length).toBeGreaterThan(25)
    for (const esperado of ["books", "expenses", "loans", "health"]) {
      expect(mods.map((m) => m.id)).toContain(esperado)
    }
  })

  it("lee las secciones del menú de la web", () => {
    const secs = seccionesWeb()
    const ids = secs.map((s) => s.id)
    expect(ids).toContain("inicio")
    expect(ids).toContain("gastos")
    expect(secs.find((s) => s.id === "gastos")?.nombre).toBe("Gastos")
  })

  it("arma los servicios y las variables obligatorias del servidor", () => {
    const secciones = infraestructura()
    const servicios = secciones.find((s) => s.titulo === "Servicios en el servidor")
    expect(servicios?.filas.map((f) => f.id)).toEqual(expect.arrayContaining(["db", "api", "web"]))
    const vars = secciones.find((s) => s.id === "variables")
    expect(vars?.filas.length).toBeGreaterThan(0)
    // De las variables solo se dice si están: jamás el valor.
    for (const f of vars?.filas ?? []) expect(["definida", "falta"]).toContain(f.valor)
  })

  it("la arquitectura trae el flujo, las reglas, los módulos y las secciones", () => {
    const a = arquitectura()
    expect(a.map((s) => s.id)).toEqual(["flujo", "reglas", "modulos", "secciones"])
    for (const s of a) expect(s.filas.length).toBeGreaterThan(0)
  })

  it("todas las variables de .env.example se pueden leer", () => {
    expect(variablesEsperadas().length).toBeGreaterThan(5)
  })
})

describe("catálogo de comandos", () => {
  it("todo comando de riesgo alto tiene palabra de confirmación y advertencia", () => {
    for (const c of COMANDOS.filter((x) => x.riesgo === "alto")) {
      expect(c.confirmacion, c.id).toBeTruthy()
      expect(c.advertencia, c.id).toBeTruthy()
    }
  })

  it("ningún comando despliega a producción: para eso está /deploy", () => {
    for (const c of COMANDOS) {
      const todo = `${c.cmd} ${c.args.join(" ")}`
      expect(todo).not.toMatch(/\bpush\b/)
      expect(todo).not.toMatch(/deploy/)
    }
  })

  it("los identificadores no se repiten y todos tienen descripción", () => {
    expect(new Set(COMANDOS.map((c) => c.id)).size).toBe(COMANDOS.length)
    for (const c of COMANDOS) expect(c.detalle.length, c.id).toBeGreaterThan(10)
  })
})
