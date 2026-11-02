import { describe, expect, it } from "vitest"
import { canEdit, draftComponents, draftToMeta, emptyDraft, metaToDraft, validateDraft, type TemplateDraft } from "./wa-templates"

const base = (x: Partial<TemplateDraft> = {}): TemplateDraft => ({ ...emptyDraft(), name: "mirai_pago", header: { type: "image", url: "https://x.supabase.co/storage/v1/object/public/public-assets/whatsapp/a.png" }, ...x })

describe("validaciones de Meta al crear una plantilla", () => {
  it("el borrador por defecto con nombre e imagen es válido", () => expect(validateDraft(base()).errors).toEqual([]))
  it("nombre en minúsculas y guiones bajos", () => {
    expect(validateDraft(base({ name: "Mirai Pago" })).errors[0]).toMatch(/minúsculas/)
    expect(validateDraft(base({ name: "pago_próximo" })).errors[0]).toMatch(/minúsculas/)
    expect(validateDraft(base({ name: "" })).errors[0]).toMatch(/nombre/)
  })
  it("variables: seguidas desde {{1}}, no al inicio ni al final, no pegadas y con ejemplo", () => {
    const e = (body: string, examples = ["a", "b", "c"]) => validateDraft(base({ body, examples })).errors.join(" | ")
    expect(e("{{1}} tienes un pago pendiente en Mirai hoy.")).toMatch(/empezar con una variable/)
    expect(e("Hola, tu pago pendiente en Mirai es {{1}}")).toMatch(/terminar con una variable/)
    expect(e("Hola {{1}} {{2}}, tienes pagos pendientes en Mirai hoy.")).toMatch(/pegadas/)
    expect(e("Hola {{1}}, tienes {{3}} pagos pendientes en Mirai hoy.")).toMatch(/seguidas desde/)
    expect(e("Hola {{nombre}}, tienes pagos pendientes en Mirai hoy.")).toMatch(/con números/)
    expect(e("Hola {{1}}, tienes {{2}} pagos pendientes en Mirai hoy.", ["Ana", ""])).toMatch(/ejemplo para \{\{2\}\}/)
    expect(e("Hola {{1}}, tienes {{2}} pagos pendientes en Mirai hoy.", ["Ana", "uno\ndos"])).toMatch(/saltos de línea/)
    expect(e("Hola {{1}}: {{2}}.", ["a", "b"])).toMatch(/demasiadas variables/)
  })
  it("longitudes: encabezado y pie de 60, cuerpo de 1.024 y botones de 25", () => {
    expect(validateDraft(base({ header: { type: "text", text: "x".repeat(61) } })).errors.join()).toMatch(/máximo 60/)
    expect(validateDraft(base({ footer: "y".repeat(61) })).errors.join()).toMatch(/pie tiene 61/)
    expect(validateDraft(base({ body: `Hola ${"z ".repeat(600)}.`, examples: [] })).errors.join()).toMatch(/máximo 1.024/)
    expect(validateDraft(base({ buttons: [{ type: "quick_reply", text: "Este texto es demasiado largo" }] })).errors.join()).toMatch(/máximo 25/)
  })
  it("encabezado de texto: una variable {{1}} con ejemplo y sin emojis", () => {
    expect(validateDraft(base({ header: { type: "text", text: "Hola {{1}}" } })).errors.join()).toMatch(/ejemplo para la variable del encabezado/)
    expect(validateDraft(base({ header: { type: "text", text: "Hola {{1}} {{2}}", example: "a" } })).errors.join()).toMatch(/una sola variable/)
    expect(validateDraft(base({ header: { type: "text", text: "Pagos 💸" } })).errors.join()).toMatch(/emojis/)
    expect(validateDraft(base({ header: { type: "image", url: "" } })).errors.join()).toMatch(/imagen del encabezado/)
  })
  it("botones: enlace con {{1}} al final y su ejemplo, máximo 2 enlaces y 1 llamada", () => {
    expect(validateDraft(base({ buttons: [{ type: "url", text: "Ver", url: "https://mirai.engynex.com/{{1}}" }] })).errors.join()).toMatch(/ejemplo del final del enlace/)
    expect(validateDraft(base({ buttons: [{ type: "url", text: "Ver", url: "https://mirai.engynex.com/{{1}}/x", example: "a" }] })).errors.join()).toMatch(/debe ir al final/)
    expect(validateDraft(base({ buttons: [1, 2, 3].map(() => ({ type: "url" as const, text: "Ver", url: "https://mirai.engynex.com" })) })).errors.join()).toMatch(/Máximo 2 botones de enlace/)
    expect(validateDraft(base({ buttons: [{ type: "phone", text: "Llamar", phone: "123" }] })).errors.join()).toMatch(/indicativo/)
  })
})

describe("cuerpo para Meta", () => {
  it("imagen, cuerpo con ejemplos, pie y botones (respuestas rápidas primero)", () => {
    const d = base({ buttons: [{ type: "url", text: "Abrir", url: "https://mirai.engynex.com/{{1}}", example: "inicio" }, { type: "quick_reply", text: "Ya pagué" }, { type: "phone", text: "Llamar", phone: "601 123 4567" }] })
    const m = draftToMeta(d, "4::abc")
    expect(m).toMatchObject({ name: "mirai_pago", language: "es_CO", category: "UTILITY", parameter_format: "POSITIONAL" })
    expect(m.components).toEqual([
      { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::abc"] } },
      { type: "BODY", text: d.body, example: { body_text: [["Alberto", "Arriendo $1.700.000 vence mañana"]] } },
      { type: "FOOTER", text: "Mirai · Tu futuro financiero" },
      { type: "BUTTONS", buttons: [
        { type: "QUICK_REPLY", text: "Ya pagué" },
        { type: "URL", text: "Abrir", url: "https://mirai.engynex.com/{{1}}", example: ["https://mirai.engynex.com/inicio"] },
        { type: "PHONE_NUMBER", text: "Llamar", phone_number: "+576011234567" },
      ] },
    ])
  })
  it("encabezado de texto con ejemplo; la imagen exige el identificador subido", () => {
    expect(draftComponents(base({ header: { type: "text", text: "Hola {{1}}", example: "Ana" } }))[0]).toEqual({ type: "HEADER", format: "TEXT", text: "Hola {{1}}", example: { header_text: ["Ana"] } })
    expect(() => draftComponents(base())).toThrow(/imagen/)
  })
  it("de Meta a borrador (editar) y estados editables", () => {
    const d = metaToDraft({ name: "t", language: "es_CO", category: "UTILITY", components: [
      { type: "HEADER", format: "IMAGE", example: { header_handle: ["https://scontent.whatsapp.net/x.jpg"] } },
      { type: "BODY", text: "Hola {{1}}, revisa.", example: { body_text: [["Ana"]] } },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://m.co/{{1}}", example: ["https://m.co/inicio"] }] },
    ] })
    expect(d.header).toEqual({ type: "image", url: "https://scontent.whatsapp.net/x.jpg" })
    expect(d.examples).toEqual(["Ana"])
    expect(d.buttons[0]).toEqual({ type: "url", text: "Ver", url: "https://m.co/{{1}}", example: "inicio" })
    expect(canEdit("APPROVED")).toBe(true)
    expect(canEdit("PENDING")).toBe(false)
  })
})
