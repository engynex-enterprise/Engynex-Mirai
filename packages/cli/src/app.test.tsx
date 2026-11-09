// Que la consola de la terminal se dibuje de verdad: logo, menú y paneles, sin tumbarse.
import { render } from "ink-testing-library"
import { describe, expect, it } from "vitest"
import { App } from "./app.tsx"

/** Ink pinta en varios cuadros; se espera a que el contenido aparezca. */
const esperar = (obtener: () => string | undefined, texto: string, intentos = 60) =>
  new Promise<string>((listo, falla) => {
    let n = 0
    const mirar = setInterval(() => {
      const v = obtener() ?? ""
      if (v.includes(texto)) {
        clearInterval(mirar)
        listo(v)
      } else if (++n > intentos) {
        clearInterval(mirar)
        falla(new Error(`nunca apareció "${texto}". Último cuadro:\n${v}`))
      }
    }, 50)
  })

describe("la consola en la terminal", () => {
  it("dibuja el logo y el menú completo", async () => {
    const { lastFrame, unmount } = render(<App inicial="stack" sinRaton />)
    const cuadro = await esperar(lastFrame, "Arquitectura")
    expect(cuadro).toContain("未来")
    for (const s of ["Salud", "Stack", "Infra", "Arquitectura", "Comandos", "Ayuda"]) expect(cuadro).toContain(s)
    // Ninguna opción del menú se parte en dos líneas (pasaba con "Arquitectura" y un menú angosto).
    for (const linea of cuadro.split("\n")) expect(linea.trim()).not.toMatch(/^│\s*Arquitectura/)
    expect(cuadro).toContain("q salir")
    unmount()
  })

  it("muestra el stack con versiones reales", async () => {
    const { lastFrame, unmount } = render(<App inicial="stack" sinRaton />)
    const cuadro = await esperar(lastFrame, "Next.js")
    expect(cuadro).toMatch(/Next\.js\s+\d+\./)
    unmount()
  })

  it("muestra los comandos y marca los de riesgo", async () => {
    const { lastFrame, unmount } = render(<App inicial="comandos" sinRaton />)
    const cuadro = await esperar(lastFrame, "Levantar todo local")
    expect(cuadro).toContain("⚠")
    expect(cuadro).toContain("pide confirmación escrita")
    unmount()
  })

  it("la ayuda explica los atajos", async () => {
    const { lastFrame, unmount } = render(<App inicial="ayuda" sinRaton />)
    const cuadro = await esperar(lastFrame, "Mover la selección")
    expect(cuadro).toContain("ratón")
    unmount()
  })

  it("no se le escapa ningún secreto a la pantalla", async () => {
    const { lastFrame, unmount } = render(<App inicial="infra" sinRaton />)
    // "Variables obligatorias" queda más abajo, fuera del alto visible: lo que se revisa aquí es el
    // cuadro que SÍ se pinta. Que las variables nunca lleven valor lo cubre la prueba de infraestructura().
    const cuadro = await esperar(lastFrame, "DÓNDE VIVE MIRAI")
    expect(cuadro).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
    expect(cuadro).not.toMatch(/postgres:\/\/[^\s]*:[^\s@]+@/)
    unmount()
  })
})
