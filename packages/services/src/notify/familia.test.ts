import { describe, expect, it } from "vitest"
import { canalesFamilia, familiaMsg } from "./familia"
import { defaultRule } from "./digest"
import { defaultMatriz, onFor } from "./rules"

const todo = { email: true, whatsapp: true, push: true, telegram: true }

describe("avisos de los movimientos de la familia", () => {
  it("por defecto: en la app, correo, WhatsApp y push (no Telegram); cada canal solo si su interruptor está prendido", () => {
    expect(["app", "email", "whatsapp", "push", "telegram"].map((c) => onFor(defaultMatriz(), "familia", c as never))).toEqual([true, true, true, true, false])
    const r = defaultRule("u", "b")
    expect(canalesFamilia(r, todo, 10)).toEqual([])
    expect(canalesFamilia({ ...r, canales: { app: true, email: true, whatsapp: true } }, todo, 10)).toEqual(["email", "whatsapp"])
  })
  it("se respeta la matriz, el interruptor de la fila, lo que Mirai tiene activo y el silencio del push", () => {
    const r = { ...defaultRule("u", "b"), canales: { email: true, whatsapp: true, push: true }, silencio: { on: true, desde: 22, hasta: 7 } }
    expect(canalesFamilia({ ...r, matriz: { familia: { whatsapp: false, email: true, push: true } } }, todo, 10)).toEqual(["email", "push"])
    expect(canalesFamilia({ ...r, notif: { familia: false } }, todo, 10)).toEqual([])
    expect(canalesFamilia(r, { ...todo, whatsapp: false }, 10)).toEqual(["email", "push"])
    expect(canalesFamilia(r, todo, 23)).toEqual(["email", "whatsapp"])
  })
  it("mensaje: quién, cuántos y cada movimiento; con montos ocultos no sale ningún valor", () => {
    const row = { n: 3, lineas: ["Gasto: Mercado D1 · $ 85.000", "Gasto: Gasolina · $ 40.000", "Ingreso: Venta bici · $ 350.000"], href: "/gastos-todos" }
    const m = familiaMsg({ nombre: "Alberto Navarro", quien: "Andrea López", libro: "Casa", row, hide: false, siteUrl: "https://mirai.engynex.com" })
    expect(m.subject).toBe("Mirai: Andrea registró 3 movimientos")
    expect(m.text).toContain("• Gasto: Mercado D1 · $ 85.000")
    expect(m.text).toContain("https://mirai.engynex.com/gastos-todos")
    expect(m.wa.resumen).toMatch(/^Andrea registró 3 movimientos en «Casa»/)
    const h = familiaMsg({ nombre: "Alberto", quien: "Andrea", libro: "Casa", row, hide: true, siteUrl: "https://x" })
    expect(h.text).not.toMatch(/\$/)
    expect(h.html).not.toMatch(/\$ \d/)
    expect(h.wa.monto).toBe("")
    expect(h.text).toContain("• Gasto: Mercado D1")
  })
})
