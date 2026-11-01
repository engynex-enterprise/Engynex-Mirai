import { describe, expect, it } from "vitest"
import { BRANDS, brandFor, INTEGRATION_BRAND, POPULAR_SUBS } from "./brands"

describe("brandFor", () => {
  it("reconoce suscripciones por su nombre, sin importar tildes ni mayúsculas", () => {
    expect(brandFor("Netflix Premium")).toBe("netflix")
    expect(brandFor("Spotify Familiar")).toBe("spotify")
    expect(brandFor("YouTube Music")).toBe("youtube-music")
    expect(brandFor("YouTube Premium")).toBe("youtube")
    expect(brandFor("Apple TV+")).toBe("apple-tv")
    expect(brandFor("Disney+")).toBe("disney")
    expect(brandFor("Amazon Prime Video")).toBe("prime-video")
    expect(brandFor("HBO Max")).toBe("max")
    expect(brandFor("ChatGPT Plus")).toBe("openai")
    expect(brandFor("Tarjeta Visa Bancolombia")).toBe("visa")
    expect(brandFor("Arriendo")).toBeNull()
    expect(brandFor("")).toBeNull()
  })
  it("cada clave usada en la app existe en el catálogo", () => {
    for (const k of [...POPULAR_SUBS, ...Object.values(INTEGRATION_BRAND), "google"]) expect(BRANDS[k], k).toBeDefined()
  })
})
