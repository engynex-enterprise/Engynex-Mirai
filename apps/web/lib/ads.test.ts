import { describe, expect, it } from "vitest"
import { adSeed, adVigente, adsTxt, campaignCost, ctr, eligibleAds, goesToAdsense, pickAd } from "./ads"

const ad = (id: string, o: Partial<{ ubicaciones: string[]; activo: boolean; desde: string | null; hasta: string | null; prioridad: number }> = {}) =>
  ({ id, ubicaciones: ["inicio"], activo: true, desde: null, hasta: null, prioridad: 0, ...o })

describe("anuncios", () => {
  const hoy = "2026-11-01"
  it("vigencia por fechas y estado", () => {
    expect(adVigente(ad("a"), hoy)).toBe(true)
    expect(adVigente(ad("a", { activo: false }), hoy)).toBe(false)
    expect(adVigente(ad("a", { desde: "2026-11-02" }), hoy)).toBe(false)
    expect(adVigente(ad("a", { hasta: "2026-10-31" }), hoy)).toBe(false)
    expect(adVigente(ad("a", { desde: "2026-11-01", hasta: "2026-11-01" }), hoy)).toBe(true)
  })
  it("elige por ubicación y prioridad; rota entre iguales", () => {
    const list = [ad("b"), ad("a"), ad("c", { prioridad: 5, ubicaciones: ["lista"] })]
    expect(pickAd(list, "lista", hoy, 0)?.id).toBe("c")
    expect(pickAd(list, "reportes", hoy, 0)).toBeNull()
    expect(pickAd(list, "inicio", hoy, 0)?.id).toBe("a")
    expect(pickAd(list, "inicio", hoy, 1)?.id).toBe("b")
    expect(pickAd(list, "inicio", hoy, -3)?.id).toBe("b")
  })
  it("semilla estable por persona y día", () => {
    expect(adSeed("u1", hoy)).toBe(adSeed("u1", hoy))
    expect(adSeed("u1", hoy)).not.toBe(adSeed("u1", "2026-11-02"))
  })
  it("CTR y ads.txt", () => {
    expect(ctr(0, 0)).toBe(0)
    expect(ctr(200, 3)).toBe(1.5)
    expect(adsTxt("ca-pub-1234567890")).toBe("google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n")
    expect(adsTxt("algo")).toBe("")
    expect(adsTxt(undefined)).toBe("")
  })
})

describe("campañas y segmentación", () => {
  const hoy = "2026-11-01"
  const camp = { id: "c1", estado: "activa", desde: null, hasta: null, planes: ["gratis"], dispositivos: ["movil"], frecuencia_max: 2, prioridad: 10 }
  const base = { id: "a1", ubicaciones: ["inicio"], activo: true, desde: null, hasta: null, prioridad: 0, campaign_id: "c1" }
  const ctx = { slot: "inicio" as const, hoy, plan: "gratis", device: "movil" as const, vistasHoy: {} }
  it("respeta estado, plan, dispositivo y suma la prioridad de la campaña", () => {
    expect(eligibleAds([base], [camp], ctx).map((a) => a.prioridad)).toEqual([10])
    expect(eligibleAds([base], [{ ...camp, estado: "pausada" }], ctx)).toEqual([])
    expect(eligibleAds([base], [camp], { ...ctx, plan: "premium" })).toEqual([])
    expect(eligibleAds([base], [camp], { ...ctx, device: "escritorio" })).toEqual([])
    expect(eligibleAds([base], [], ctx)).toEqual([])
  })
  it("limita las veces por persona al día", () => {
    expect(eligibleAds([base], [camp], { ...ctx, vistasHoy: { a1: 2 } })).toEqual([])
    expect(eligibleAds([{ ...base, campaign_id: null }], [], { ...ctx, vistasHoy: { a1: 4 } })).toHaveLength(1)
    expect(eligibleAds([{ ...base, campaign_id: null }], [], { ...ctx, vistasHoy: { a1: 5 } })).toEqual([])
  })
  it("mezcla con AdSense según el porcentaje y calcula el gasto", () => {
    expect(goesToAdsense(5, 30)).toBe(true)
    expect(goesToAdsense(45, 30)).toBe(false)
    expect(goesToAdsense(5, 0)).toBe(false)
    expect(campaignCost({ modelo_cobro: "cpm", tarifa: 20000 }, 5000, 10)).toBe(100000)
    expect(campaignCost({ modelo_cobro: "cpc", tarifa: 800 }, 5000, 10)).toBe(8000)
    expect(campaignCost({ modelo_cobro: "fijo", tarifa: 500000 }, 5000, 10)).toBe(500000)
  })
})
