import { describe, expect, it } from "vitest"
import { autoMap, buildTemplateMessage, caseConfig, caseOfDigest, esPlantillaDeMeta, fallbackTemplate, plantillaDeRespaldo, formatCoPhone, normalizeCoPhone, pickTemplate, roleOf, sampleValues, templateSlots, urlSuffix, waErrorMsg, waParam, waSettings, waValuesFromText, withBase, type MetaTemplate, type WaValues } from "./whatsapp"

const V: WaValues = { nombre: "Alberto", cantidad: "3", resumen: "• Arriendo — vence hoy\n• Luz — vence mañana", fecha: "lunes 2 de noviembre", enlace: "https://mirai.engynex.com/inicio", titulo: "Arriendo", detalle: "vence hoy", monto: "" }

describe("teléfono de Colombia en E.164", () => {
  it("acepta las formas comunes de escribir un celular", () => {
    for (const x of ["3151234567", "315 123 4567", "(315) 123-4567", "+57 315 123 4567", "573151234567", "00573151234567", "03151234567"]) expect(normalizeCoPhone(x)).toBe("573151234567")
  })
  it("rechaza fijos, números cortos y vacíos", () => {
    for (const x of ["6012345678", "315123456", "", null, undefined, "+1 305 123 4567", "5731512345678"]) expect(normalizeCoPhone(x)).toBeNull()
  })
  it("se muestra con espacios", () => expect(formatCoPhone("573151234567")).toBe("+57 315 123 4567"))
})

describe("parámetros de la plantilla", () => {
  it("sin saltos de línea, tabulaciones ni 4+ espacios (error 132018)", () => {
    const t = waParam("Hola\n\n• uno\t dos      tres\r\n• cuatro")
    expect(t).not.toMatch(/[\n\t]| {4,}/)
    expect(t).toBe("Hola · • uno  dos   tres · • cuatro")
  })
  it("recorta lo muy largo y nunca queda vacío", () => {
    expect(waParam("x".repeat(2000), 100)).toHaveLength(100)
    expect(waParam("   ")).toBe("-")
  })
  it("rol por nombre o por el texto que lo antecede", () => {
    expect(roleOf("nombre")).toBe("nombre")
    expect(roleOf("total_avisos")).toBe("cantidad")
    expect(roleOf("detalle")).toBe("resumen")
    expect(roleOf("1", "Hola ")).toBe("nombre")
    expect(roleOf("2", "Hola {{1}}, tienes ")).toBe("cantidad")
    expect(roleOf("3", "Hola {{1}}, tienes {{2}} avisos:\n")).toBeNull()
  })
})

type Built = { template: { name: string; language: { code: string }; components?: { type: string; sub_type?: string; index?: string; parameters: Record<string, unknown>[] }[] } }

/** mirai_resumen tal como la devuelve Meta (2 nov 2026). */
const MIRAI_RESUMEN: MetaTemplate = {
  name: "mirai_resumen", language: "es_CO", status: "APPROVED", category: "UTILITY", parameter_format: "POSITIONAL",
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["https://scontent.whatsapp.net/x.jpg"] } },
    { type: "BODY", text: "Hola, estos son los recordatorios de pagos que programaste en Mirai: {{1}}. Revisa el detalle en la app.", example: { body_text: [["Arriendo $1.700.000 vence mañana"]] } },
    { type: "FOOTER", text: "Mirai · Tu futuro financiero" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Abrir Mirai", url: "https://engynex-mirai.vercel.app/login" }] },
  ],
}

describe("componentes a partir de la plantilla de Meta", () => {
  it("mirai_resumen: encabezado con imagen + 1 parámetro de texto en el cuerpo, sin parámetros para el botón fijo", () => {
    const { message } = buildTemplateMessage("573151234567", MIRAI_RESUMEN, V, { media: { link: "https://mirai.engynex.com/brand/whatsapp-header.png" } })
    const t = (message as unknown as Built).template
    expect(t).toMatchObject({ name: "mirai_resumen", language: { code: "es_CO" } })
    expect(t.components).toHaveLength(2)
    expect(t.components![0]).toEqual({ type: "header", parameters: [{ type: "image", image: { link: "https://mirai.engynex.com/brand/whatsapp-header.png" } }] })
    expect(t.components![1].type).toBe("body")
    expect(t.components![1].parameters).toHaveLength(1)
    const p = t.components![1].parameters[0] as { type: string; text: string }
    expect(p.type).toBe("text")
    expect(p.text).not.toMatch(/[\n\t]| {5,}/)
    expect(p.text).toBe("• Arriendo — vence hoy · • Luz — vence mañana")
    expect(t.components!.some((c) => c.type === "button")).toBe(false)
  })
  it("encabezado con imagen subida a Meta (id) y sin imagen: error legible", () => {
    const { message } = buildTemplateMessage("573151234567", MIRAI_RESUMEN, V, { media: { id: "123" } })
    expect((message as unknown as Built).template.components![0].parameters[0]).toEqual({ type: "image", image: { id: "123" } })
    expect(() => buildTemplateMessage("573151234567", MIRAI_RESUMEN, V)).toThrow(/imagen del encabezado/)
    expect(() => buildTemplateMessage("573151234567", MIRAI_RESUMEN, V, { media: { link: "http://localhost:3000/x.png" } })).toThrow(/https/)
  })
  it("espacios de mirai_resumen", () => {
    expect(templateSlots(MIRAI_RESUMEN).map((s) => [s.key, s.kind])).toEqual([["header.media", "image"], ["body.1", "text"]])
    expect(autoMap(MIRAI_RESUMEN)).toEqual({ "body.1": { src: "resumen" } })
  })
  it("posicional con saludo, cantidad y resumen", () => {
    const t: MetaTemplate = { name: "t", language: "es_CO", components: [{ type: "BODY", text: "Hola {{1}}, tienes {{2}} avisos en Mirai:\n{{3}}\nAbre Mirai para ver el detalle." }] }
    expect(autoMap(t)).toEqual({ "body.1": { src: "nombre" }, "body.2": { src: "cantidad" }, "body.3": { src: "resumen" } })
    expect(autoMap({ name: "t", language: "es", components: [{ type: "BODY", text: "{{1}} · {{2}}" }] })).toEqual({ "body.1": { src: "nombre" }, "body.2": { src: "resumen" } })
  })
  it("con nombres, encabezado de texto y botones con parámetros (URL variable, respuesta rápida, copiar código)", () => {
    const t: MetaTemplate = { name: "t", language: "es_CO", parameter_format: "NAMED", components: [
      { type: "HEADER", format: "TEXT", text: "Hola {{nombre}}" },
      { type: "BODY", text: "Tienes {{cantidad}} avisos: {{detalle}}" },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ya pagué" }, { type: "URL", text: "Ver", url: "https://mirai.engynex.com/{{1}}" }, { type: "COPY_CODE", text: "Copiar" }, { type: "PHONE_NUMBER", text: "Llamar", phone_number: "+576011234567" }] },
    ] }
    const { message, preview } = buildTemplateMessage("573151234567", t, V, { map: { "button.2": { src: "fijo", text: "MIRAI 2026" } } })
    const c = (message as unknown as Built).template.components!
    expect(c[0]).toEqual({ type: "header", parameters: [{ type: "text", text: "Alberto", parameter_name: "nombre" }] })
    expect(c[1].parameters.map((p) => p.parameter_name)).toEqual(["cantidad", "detalle"])
    expect(c.slice(2)).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "Ya pagué" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "inicio" }] },
      { type: "button", sub_type: "copy_code", index: "2", parameters: [{ type: "coupon_code", coupon_code: "MIRAI2026" }] },
    ])
    expect(preview.find((p) => p.key === "header.nombre")?.value).toBe("Alberto")
  })
  it("asignación manual: un dato de Mirai o un texto fijo", () => {
    const t: MetaTemplate = { name: "t", language: "es", components: [{ type: "BODY", text: "Hola {{1}}, recuerda {{2}} por {{3}}." }] }
    const { message } = buildTemplateMessage("573151234567", t, { ...V, titulo: "Arriendo", monto: "$1.700.000" }, { map: { "body.1": { src: "fijo", text: "familia" }, "body.2": { src: "titulo" }, "body.3": { src: "monto" } } })
    expect((message as unknown as Built).template.components![0].parameters.map((p) => p.text)).toEqual(["familia", "Arriendo", "$1.700.000"])
  })
  it("final del enlace para botones con URL variable", () => {
    expect(urlSuffix("https://mirai.engynex.com/{{1}}", "https://mirai.engynex.com/gastos-fijos")).toBe("gastos-fijos")
    expect(urlSuffix("https://otro.co/app/{{1}}", "https://mirai.engynex.com/metas")).toBe("metas")
    expect(urlSuffix("https://x.co/{{1}}", "")).toBe("inicio")
  })
  it("elige la aprobada en el idioma pedido", () => {
    const list = [{ name: "mirai_resumen", language: "en_US", status: "APPROVED" }, { name: "mirai_resumen", language: "es", status: "APPROVED" }, { name: "mirai_resumen", language: "es_CO", status: "REJECTED" }]
    expect(pickTemplate(list, "mirai_resumen", "es_CO")?.language).toBe("es")
    expect(pickTemplate(list, "otra")).toBeNull()
  })
  it("respaldo sin ID de la cuenta: un parámetro posicional con el resumen", () => {
    const { message } = buildTemplateMessage("573151234567", fallbackTemplate("mirai_resumen", "es_CO"), V)
    expect(message).toMatchObject({ messaging_product: "whatsapp", to: "573151234567", type: "template", template: { name: "mirai_resumen", language: { code: "es_CO" }, components: [{ type: "body", parameters: [{ type: "text" }] }] } })
  })
  it("el cuerpo nunca pasa de 1.024 caracteres", () => {
    const { message } = buildTemplateMessage("573151234567", MIRAI_RESUMEN, { ...V, resumen: "x ".repeat(2000) }, { media: { id: "1" } })
    const text = ((message as unknown as Built).template.components![1].parameters[0] as { text: string }).text
    expect(MIRAI_RESUMEN.components![1].text!.replace("{{1}}", text).length).toBeLessThanOrEqual(1024)
  })
})

describe("ajustes y casos", () => {
  const s = waSettings({ template: "mirai_resumen", lang: "es_CO", wa: { headerImage: "https://x.co/a.png", casos: { pagos: { template: "mirai_pago", lang: "es", map: { "body.1": { src: "titulo" } } }, prueba: { headerImage: "https://x.co/p.png" } } } })
  it("un caso sin plantilla propia usa la por defecto", () => {
    expect(caseConfig(s, "resumen")).toMatchObject({ template: "mirai_resumen", lang: "es_CO", headerImage: "https://x.co/a.png", propia: false })
    expect(caseConfig(s, "prueba")).toMatchObject({ template: "mirai_resumen", headerImage: "https://x.co/p.png" })
  })
  it("un caso con plantilla propia usa su idioma y su asignación", () => {
    expect(caseConfig(s, "pagos")).toMatchObject({ template: "mirai_pago", lang: "es", map: { "body.1": { src: "titulo" } }, propia: true })
  })
  it("configuración vieja sin `wa`", () => expect(waSettings({ template: "x" })).toMatchObject({ template: "x", lang: "es_CO", casos: {}, map: {} }))
  it("caso según los avisos del resumen", () => {
    expect(caseOfDigest(["pagos", "pagos"])).toBe("pagos")
    expect(caseOfDigest(["pagos", "presupuesto"])).toBe("resumen")
    expect(caseOfDigest([])).toBe("resumen")
  })
  it("valores de ejemplo y texto libre", () => {
    expect(sampleValues("pagos").enlace).toBe("https://mirai.engynex.com/gastos-fijos")
    expect(waValuesFromText("Gasto grande\nSe registró $850.000")).toMatchObject({ titulo: "Gasto grande", detalle: "Se registró $850.000", monto: "$850.000" })
    expect(withBase("http://localhost:3000/inicio", "https://mirai.engynex.com")).toBe("https://mirai.engynex.com/inicio")
  })
})

describe("errores de Meta en español", () => {
  it("códigos conocidos", () => {
    expect(waErrorMsg({ code: 131030 })).toMatch(/lista de destinatarios permitidos/)
    expect(waErrorMsg({ code: 132000 })).toMatch(/cantidad de parámetros/)
    expect(waErrorMsg({ code: 132012 })).toMatch(/imagen del encabezado.*código 132012/)
    expect(waErrorMsg({ code: 100, error_user_title: "Nombre inválido", error_user_msg: "Usa minúsculas" })).toBe("Nombre inválido: Usa minúsculas (código 100)")
  })
  it("ID de número equivocado", () => expect(waErrorMsg({ code: 100, message: "Unsupported post request. Object with ID '1' does not exist" })).toMatch(/Phone number ID/))
  it("desconocido: deja el detalle de Meta", () => expect(waErrorMsg({ code: 1, error_data: { details: "algo pasó" } })).toBe("algo pasó (código 1)"))
})

describe("plantilla de respaldo", () => {
  const tpl = (name: string, status: string, body = "Hola {{1}}", language = "es_CO"): MetaTemplate => ({ name, language, status, components: [{ type: "BODY", text: body }] })
  const meta = tpl("3p_direct_integration_test_template", "APPROVED", "Welcome! This is a test message", "en_US")
  it("mirai_resumen en revisión: usa la por defecto si está aprobada", () => {
    const list = [tpl("mirai_resumen", "PENDING"), tpl("mirai_pagos", "APPROVED"), meta]
    expect(plantillaDeRespaldo(list, "mirai_pagos", "mirai_resumen")?.name).toBe("mirai_pagos")
  })
  it("sin otra propia aprobada: la de ejemplo de Meta", () => {
    const list = [tpl("mirai_resumen", "PENDING"), tpl("otra", "REJECTED"), meta]
    expect(plantillaDeRespaldo(list, "mirai_resumen", "mirai_resumen")?.name).toBe("3p_direct_integration_test_template")
    expect(esPlantillaDeMeta("hello_world")).toBe(true)
  })
  it("prefiere una propia con variable en español antes que la de Meta", () => {
    const list = [meta, tpl("aviso_en", "APPROVED", "Hi {{1}}", "en_US"), tpl("aviso_es", "APPROVED")]
    expect(plantillaDeRespaldo(list, "", "mirai_resumen")?.name).toBe("aviso_es")
  })
  it("ninguna aprobada: null", () => {
    expect(plantillaDeRespaldo([tpl("mirai_resumen", "PENDING")], "", "mirai_resumen")).toBeNull()
  })
})
