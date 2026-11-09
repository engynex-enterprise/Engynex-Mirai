import { describe, expect, it } from "vitest"
import { expectClose, legacyCall, scenario } from "./__tests__/adapt"
import { dedCalc, fspPct, refPorAnio, retEmpleado, smmlvFor, uvtFor, type Deducciones } from "./payroll"

const HOY = "2026-10-31"
const sc = scenario(HOY)
const ref = { smmlv: smmlvFor(2026, sc.book.settings.smmlv), uvt: uvtFor(2026, sc.book.settings.uvt) }

// Salarios de 1 a 30 SMMLV para recorrer todos los tramos del FSP y de la tabla del art. 383.
const SALARIOS = [1750905, 2500000, 4750000, 7003620, 8000000, 12000000, 20000000, 28014480, 29765385, 31516290, 33267195, 35018100, 45000000, 52527150, 80000000]

describe("SMMLV y UVT = v4", () => {
  it("valores por defecto y sobrescritos", () => {
    expect(ref.smmlv).toBe(sc.ev("smmlv()"))
    expect(ref.uvt).toBe(sc.ev("uvtHoy()"))
    const s2 = scenario(HOY).mutate("S.cfg.smmlv={2026:1800000};S.cfg.uvt[2026]=53000;")
    expect(smmlvFor(2026, s2.book.settings.smmlv)).toBe(s2.ev("smmlv()"))
    expect(uvtFor(2026, s2.book.settings.uvt)).toBe(s2.ev("uvtHoy()"))
    expect(uvtFor(2025, {})).toBe(49799)
  })
})

describe("SMMLV y UVT desde las tablas ref_* con respaldo", () => {
  const ref = refPorAnio([{ year: 2027, valor: "1900000" }, { year: 2026, valor: 1750905 }, { year: 2025, valor: 0 }])
  it("usa ref_smmlv cuando el libro no tiene sobrescritura", () => {
    expect(ref).toEqual({ 2027: 1900000, 2026: 1750905 })
    expect(smmlvFor(2027, {}, ref)).toBe(1900000)
    expect(smmlvFor(2027, { 2027: 2000000 }, ref)).toBe(2000000)
  })
  it("sin la tabla (o sin el año) usa las constantes del código", () => {
    expect(smmlvFor(2027, {}, null)).toBe(1750905)
    expect(smmlvFor(2026, null, {})).toBe(1750905)
    expect(uvtFor(2025, {}, { 2026: 52374 })).toBe(49799)
    expect(uvtFor(2027, {}, { 2027: 55000 })).toBe(55000)
    expect(uvtFor(2030, {}, undefined)).toBe(52374)
  })
})

describe("fspPct y retEmpleado = v4", () => {
  it.each(SALARIOS)("salario %d", (s) => {
    expect(fspPct(s, ref.smmlv)).toBe(sc.ev(`fspPct(${s})`))
    const aportes = s * 0.08 + (s * fspPct(s, ref.smmlv)) / 100
    expect(retEmpleado(s, aportes, ref.uvt)).toBe(sc.ev(`retEmpleado(${s},${aportes})`))
  })
  it("sin retención para salarios bajos", () => expect(retEmpleado(4750000, 380000, ref.uvt)).toBe(0))
})

const CONFIGS: Record<string, Deducciones> = {
  "empleado por defecto": { tipo: "empleado" },
  "empleado sin FSP ni retención": { tipo: "empleado", fsp: false, ret: false },
  "empleado retención manual": { tipo: "empleado", retModo: "manual", retV: 150000 },
  "empleado retención %": { tipo: "empleado", retModo: "pct", retV: 3.5 },
  "empleado salud 0 (cae al 4 %)": { tipo: "empleado", saludP: 0, pensionP: 0 },
  "independiente riesgo I": { tipo: "independiente" },
  "independiente riesgo V, IBC 60 %, retención 10 %": { tipo: "independiente", arlN: "5", ibcP: 60, retV: 10 },
  "independiente retención manual": { tipo: "independiente", retModo: "manual", retV: 200000, arl: false },
  pensionado: { tipo: "pensionado" },
  "pensionado salud 4 %": { tipo: "pensionado", saludP: 4 },
  "otro con descuentos propios": { tipo: "otro", otros: [{ n: "Libranza", v: 350000 }, { n: "Cooperativa", v: 2, pct: true }, { n: "", v: 1 }, {}] },
  "empleado + otros": { tipo: "empleado", otros: [{ n: "Medicina prepagada", v: 280000 }] },
}

describe("dedCalc = v4", () => {
  for (const [nombre, D] of Object.entries(CONFIGS))
    for (const frec of ["mensual", "quincenal", "semanal", "anual"])
      it(`${nombre} · ${frec}`, () => {
        for (const s of SALARIOS) {
          const bruto = frec === "quincenal" ? s / 2 : frec === "semanal" ? (s * 12) / 52 : frec === "anual" ? s * 12 : s
          // Independientes por encima de 25 SMMLV de IBC: la v5 aplica el tope legal (la v4 no). Ver NOTAS.md.
          if (D.tipo === "independiente" && (s * (+(D.ibcP ?? 0) || 40)) / 100 > 25 * ref.smmlv) continue
          // Pensionados sin un % escrito a mano: la v4 cobraba 12 % a todos; la v5 aplica la escala 4/10/12 y el
          // aporte de solidaridad (ver NOTAS.md). La paridad solo se exige donde el % sí coincide.
          if (D.tipo === "pensionado" && (!D.saludP || s > 10 * ref.smmlv)) continue
          expectClose(dedCalc(bruto, frec, D, ref), legacyCall(sc.L, "dedCalc", bruto, frec, D))
        }
      })
  it("pensión: la salud va por tramos (4 %, 10 % y 12 %) y suma solidaridad en mesadas altas", () => {
    const salud = (mesada: number) => dedCalc(mesada, "mensual", { tipo: "pensionado" }, ref).items.find((x) => x.n === "Salud")!.v
    expect(salud(ref.smmlv)).toBe(Math.round(ref.smmlv * 0.04))
    expect(salud(2 * ref.smmlv)).toBe(Math.round(2 * ref.smmlv * 0.1))
    expect(salud(5 * ref.smmlv)).toBe(Math.round(5 * ref.smmlv * 0.12))
    const alta = dedCalc(12 * ref.smmlv, "mensual", { tipo: "pensionado" }, ref)
    expect(alta.items.find((x) => x.n === "Aporte de solidaridad")?.v).toBe(Math.round(12 * ref.smmlv * 0.01))
    expect(dedCalc(21 * ref.smmlv, "mensual", { tipo: "pensionado" }, ref).items.find((x) => x.n === "Aporte de solidaridad")?.v).toBe(Math.round(21 * ref.smmlv * 0.02))
    // Con un porcentaje escrito a mano manda ese.
    expect(dedCalc(5 * ref.smmlv, "mensual", { tipo: "pensionado", saludP: 4 }, ref).items.find((x) => x.n === "Salud")!.v).toBe(Math.round(5 * ref.smmlv * 0.04))
  })
  it("independiente: el IBC no pasa de 25 SMMLV", () => {
    const r = dedCalc(200_000_000, "mensual", { tipo: "independiente", ret: false, arl: false, fsp: false }, ref)
    const salud = r.items.find((x) => x.n === "Salud")!.v
    expect(Math.abs(salud - 25 * ref.smmlv * 0.125)).toBeLessThan(1)
  })
  it("sin configuración o sin valor devuelve el bruto", () => {
    expect(dedCalc(1000, "mensual", null, ref)).toEqual({ neto: 1000, items: [], total: 0 })
    expect(dedCalc(0, "mensual", { tipo: "empleado" }, ref)).toEqual({ neto: 0, items: [], total: 0 })
  })
})

describe("auxilio de transporte (no va a salud ni pensión, sí a la retención)", () => {
  const smmlv = ref.smmlv
  it("baja la base de salud y pensión, pero no la de la retención", () => {
    const sueldo = 2 * smmlv, aux = 249_095
    const sin = dedCalc(sueldo + aux, "mensual", { tipo: "empleado" }, ref)
    const con = dedCalc(sueldo + aux, "mensual", { tipo: "empleado", noIbc: aux }, ref)
    const salud = (r: ReturnType<typeof dedCalc>) => r.items.find((x) => x.n === "Salud")!.v
    expect(salud(con)).toBeLessThan(salud(sin))
    expect(salud(con)).toBe(Math.round(sueldo * 0.04))
    expect(con.items.find((x) => x.n === "Salud")!.h).toMatch(/sin el auxilio/)
    // Con estos valores no hay retención, así que el neto sube justo lo que bajan los aportes.
    expect(con.neto).toBeGreaterThan(sin.neto)
  })
  it("sin el campo todo queda igual que antes", () => {
    const a = dedCalc(5_000_000, "mensual", { tipo: "empleado" }, ref)
    const b = dedCalc(5_000_000, "mensual", { tipo: "empleado", noIbc: 0 }, ref)
    expect(b).toEqual(a)
  })
})
