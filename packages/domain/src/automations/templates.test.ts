import { describe, expect, it } from "vitest"
import { GraphSchema, triggerOf } from "./schema"
import { automationFromTemplate, DEFAULT_TEMPLATES, TEMPLATES, templateByKey } from "./templates"

describe("plantillas de automatizaciones", () => {
  it("cada plantilla tiene clave única, un disparador y un grafo que pasa el esquema", () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) {
      expect(GraphSchema.safeParse(t.graph).success, t.key).toBe(true)
      expect(triggerOf(t.graph), t.key).toBeTruthy()
      expect(t.nombre.length, t.key).toBeLessThanOrEqual(80)
    }
  })

  it("las de por defecto que crean movimientos empiezan pausadas", () => {
    expect(DEFAULT_TEMPLATES.length).toBeGreaterThan(0)
    const row = automationFromTemplate(templateByKey("ahorro-ingreso")!, { asDefault: true })
    expect(row).toMatchObject({ activo: false, plantilla: "ahorro-ingreso", disparador: "ingreso" })
    expect(automationFromTemplate(templateByKey("gasto-alto")!)).toMatchObject({ activo: false, plantilla: null })
  })
})
