import { describe, expect, it } from "vitest"
import { ratingStats, shouldPromptRating } from "./opiniones"

const now = new Date("2026-11-01T12:00:00Z")
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe("shouldPromptRating", () => {
  it("no pide calificar en la primera semana", () => {
    expect(shouldPromptRating({ since: daysAgo(3), now })).toBe(false)
    expect(shouldPromptRating({ since: null, now })).toBe(false)
  })
  it("pide calificar después de 7 días si nunca ha calificado ni cerrado la tarjeta", () => {
    expect(shouldPromptRating({ since: daysAgo(8), now })).toBe(true)
  })
  it("no vuelve a pedir antes de 90 días desde la última calificación o desde que la cerró", () => {
    expect(shouldPromptRating({ since: daysAgo(200), lastRated: daysAgo(30), now })).toBe(false)
    expect(shouldPromptRating({ since: daysAgo(200), lastDismissed: daysAgo(89), now })).toBe(false)
    expect(shouldPromptRating({ since: daysAgo(200), lastRated: daysAgo(91), lastDismissed: daysAgo(120), now })).toBe(true)
  })
})

describe("ratingStats", () => {
  it("promedio y reparto por estrellas", () => {
    expect(ratingStats([5, 4, 4, 1])).toEqual({ avg: 3.5, count: 4, dist: [1, 0, 0, 2, 1] })
  })
  it("sin calificaciones", () => {
    expect(ratingStats([])).toEqual({ avg: 0, count: 0, dist: [0, 0, 0, 0, 0] })
  })
})
