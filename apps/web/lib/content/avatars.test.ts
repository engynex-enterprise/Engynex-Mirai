import { describe, expect, it } from "vitest"
import { AVATARS, AVATAR_BY_KEY, AVATAR_CATS, AVATAR_COUNT, MIRAI_PREFIX, miraiAvatar } from "./avatars"

// Claves de los 10 avatares de la primera versión: hay perfiles e integrantes guardados con "mirai:<clave>".
const ORIGINALES = ["alcancia", "moneda", "billete", "cohete", "planta", "grafica", "tarjeta", "calculadora", "diamante", "casa"]

describe("avatares de Mirai", () => {
  it("las claves y los nombres no se repiten", () => {
    const keys = AVATARS.map((a) => a.k)
    expect(new Set(keys).size).toBe(keys.length)
    const names = AVATARS.map((a) => a.n.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    for (const a of AVATARS) expect(a.k).toMatch(/^[a-z0-9-]+$/)
  })

  it("los 10 avatares originales siguen existiendo con su misma clave", () => {
    for (const k of ORIGINALES) {
      expect(AVATAR_BY_KEY[k], k).toBeDefined()
      expect(miraiAvatar(MIRAI_PREFIX + k)?.k).toBe(k)
    }
    expect(AVATAR_BY_KEY.cohete.n).toBe("Cohete")
    expect(miraiAvatar("mirai:no-existe")).toBeNull()
    expect(miraiAvatar("https://ejemplo.com/foto.webp")).toBeNull()
  })

  it("cada categoría tiene al menos 8 avatares y todos tienen una categoría válida", () => {
    const ids = new Set<string>(AVATAR_CATS.map((c) => c.id))
    for (const a of AVATARS) expect(ids.has(a.c), `${a.k} → ${a.c}`).toBe(true)
    for (const c of AVATAR_CATS) expect(AVATAR_COUNT[c.id], c.id).toBeGreaterThanOrEqual(8)
    for (const c of ["financiero", "infantil", "animales", "personas", "abstracto"]) expect(ids.has(c)).toBe(true)
  })

  it("los ids internos (degradados, recortes) son únicos y empiezan por la clave", () => {
    const seen = new Map<string, string>()
    for (const a of AVATARS) {
      const ids = [...a.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
      expect(ids.length, a.k).toBeGreaterThan(0)
      for (const id of ids) {
        expect(id === `av-${a.k}` || id.startsWith(`av-${a.k}-`), `${a.k}: ${id}`).toBe(true)
        expect(seen.get(id), `id repetido ${id}`).toBeUndefined()
        seen.set(id, a.k)
      }
      // Las referencias url(#…) apuntan a ids del mismo avatar
      for (const m of a.svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids, `${a.k}: url(#${m[1]})`).toContain(m[1])
    }
  })

  it("el SVG es seguro: sin scripts, eventos, enlaces ni imágenes externas", () => {
    for (const a of AVATARS) {
      expect(a.svg, a.k).not.toMatch(/<script|<foreignObject|<image|<a[\s>]|<use|<style/i)
      expect(a.svg, a.k).not.toMatch(/\son[a-z]+\s*=/i)
      expect(a.svg, a.k).not.toMatch(/href|javascript:|data:|https?:/i)
      expect(a.svg, a.k).not.toMatch(/NaN|undefined/)
      expect(a.n.trim().length, a.k).toBeGreaterThan(2)
    }
  })

  it("el SVG está bien formado (etiquetas abiertas y cerradas)", () => {
    for (const a of AVATARS) {
      const stack: string[] = []
      for (const m of a.svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
        const [, close, tag, self] = m
        if (self) continue
        if (close) expect(stack.pop(), `${a.k}: </${tag}>`).toBe(tag)
        else stack.push(tag)
      }
      expect(stack, a.k).toEqual([])
    }
  })
})
