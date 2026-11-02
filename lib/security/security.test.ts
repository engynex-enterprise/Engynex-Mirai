import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { bearerOk, safeEqual } from "./secrets"
import { assertPublicUrl, isBlockedHost, isPrivateIp, safeHref, safeNext } from "./safe-url"
import { hitWindow, limitMsg, type Window } from "./rate-limit-core"
import { escapeHtml, publicError } from "./errors"
import { inline } from "@/lib/chat/markdown"
import { encrypt, decrypt } from "@/lib/crypto"

describe("comparación de secretos", () => {
  it("iguales y distintos", () => {
    expect(safeEqual("abc", "abc")).toBe(true)
    expect(safeEqual("abc", "abd")).toBe(false)
    expect(safeEqual("abc", "abcd")).toBe(false)
  })
  it("vacíos o ausentes nunca coinciden", () => {
    expect(safeEqual("", "")).toBe(false)
    expect(safeEqual(null, "x")).toBe(false)
    expect(safeEqual(undefined, undefined)).toBe(false)
  })
  it("Bearer del cron", () => {
    expect(bearerOk("Bearer s3cr3t", "s3cr3t")).toBe(true)
    expect(bearerOk("bearer s3cr3t", "s3cr3t")).toBe(true)
    expect(bearerOk("Bearer s3cr3", "s3cr3t")).toBe(false)
    expect(bearerOk("s3cr3t", "s3cr3t")).toBe(false)
    expect(bearerOk("Bearer ", "")).toBe(false)
    expect(bearerOk("Bearer undefined", undefined)).toBe(false)
    expect(bearerOk(null, "s3cr3t")).toBe(false)
  })
})

describe("redirecciones (?next=)", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/gastos?mes=2026-01")).toBe("/gastos?mes=2026-01")
    expect(safeNext("/invitacion/abc")).toBe("/invitacion/abc")
  })
  it("bloquea otros dominios y esquemas", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/\u0000x", "/a\\b", "", null])
      expect(safeNext(bad as string)).toBe("/inicio")
  })
  it("enlaces seguros", () => {
    expect(safeHref("https://falabella.com.co/x")).toBe(true)
    expect(safeHref("/metas")).toBe(true)
    expect(safeHref("mailto:a@b.co")).toBe(true)
    for (const bad of ["javascript:alert(1)", " JAVASCRIPT:alert(1)", "data:text/html,<script>", "//evil.com", "vbscript:x", ""]) expect(safeHref(bad)).toBe(false)
  })
})

describe("SSRF: hosts y URLs bloqueados", () => {
  it("IPs privadas, loopback y metadatos", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"])
      expect(isPrivateIp(ip), ip).toBe(true)
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false)
  })
  it("nombres internos y formas numéricas raras", () => {
    for (const h of ["localhost", "LOCALHOST.", "metadata.google.internal", "db.internal", "printer.local", "intranet", "2130706433", "0x7f000001", "0177.0.0.1", "127.1", "[::1]", ""])
      expect(isBlockedHost(h), h).toBe(true)
    for (const h of ["api.resend.com", "graph.facebook.com", "smtp.gmail.com", "0xcafe.co"]) expect(isBlockedHost(h), h).toBe(false)
  })
  it("assertPublicUrl", () => {
    expect(assertPublicUrl("https://api.mercadopago.com/v1").hostname).toBe("api.mercadopago.com")
    expect(() => assertPublicUrl("http://example.com")).toThrow(/https/)
    expect(assertPublicUrl("http://example.com", { allowHttp: true }).protocol).toBe("http:")
    expect(() => assertPublicUrl("https://169.254.169.254/latest/meta-data")).toThrow(/red interna/)
    expect(() => assertPublicUrl("https://user:pass@example.com")).toThrow(/usuario/)
    expect(() => assertPublicUrl("file:///etc/passwd")).toThrow()
    expect(() => assertPublicUrl("no es url")).toThrow(/válida/)
  })
})

describe("límite de tasa (ventana fija)", () => {
  it("deja pasar hasta el máximo y luego bloquea", () => {
    const s = new Map<string, Window>()
    const t0 = 1_700_000_000_000 - (1_700_000_000_000 % 60_000)
    expect(hitWindow(s, "chat:u1", 2, 60_000, t0).ok).toBe(true)
    expect(hitWindow(s, "chat:u1", 2, 60_000, t0 + 10).ok).toBe(true)
    const third = hitWindow(s, "chat:u1", 2, 60_000, t0 + 20)
    expect(third.ok).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.resetMs).toBe(60_000 - 20)
  })
  it("cada clave lleva su cuenta y la ventana nueva reinicia", () => {
    const s = new Map<string, Window>()
    const t0 = 0
    hitWindow(s, "a", 1, 1000, t0)
    expect(hitWindow(s, "a", 1, 1000, t0 + 1).ok).toBe(false)
    expect(hitWindow(s, "b", 1, 1000, t0 + 1).ok).toBe(true)
    expect(hitWindow(s, "a", 1, 1000, t0 + 1000).ok).toBe(true)
  })
  it("mensaje legible", () => {
    expect(limitMsg(30_000)).toMatch(/un minuto/)
    expect(limitMsg(5 * 60_000)).toMatch(/5 minutos/)
  })
})

describe("errores sin detalles internos", () => {
  it("oculta mensajes técnicos", () => {
    expect(publicError({ message: 'new row violates row-level security policy for table "expenses"' })).not.toMatch(/row-level|expenses/)
    expect(publicError({ code: "42501", message: "permission denied" })).toMatch(/permiso/)
    expect(publicError({ message: 'duplicate key value violates unique constraint "x_pkey"', code: "23505" })).toBe("Ya existe un registro igual.")
    expect(publicError(new Error("fetch failed"))).toMatch(/Intenta de nuevo/)
  })
  it("conserva los mensajes escritos para la persona", () => {
    expect(publicError({ message: "ERROR:  Tu rol no permite cambiar el rol de los demás." })).toBe("Tu rol no permite cambiar el rol de los demás.")
  })
  it("escapa HTML para correos", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;")
  })
})

describe("markdown del chat sin enlaces peligrosos", () => {
  const links = (s: string) => inline(s).filter((n) => n.t === "a").map((n) => (n as { href: string }).href)
  it("permite https, rutas internas y mailto", () => {
    expect(links("[Gastos](/gastos) y [web](https://mirai.engynex.com) [c](mailto:a@b.co)")).toEqual(["/gastos", "https://mirai.engynex.com", "mailto:a@b.co"])
  })
  it("no convierte javascript:, data: ni //otro-dominio en enlace", () => {
    expect(links("[x](javascript:alert(1))")).toEqual([])
    expect(links("[x](data:text/html,hola)")).toEqual([])
    expect(links("[x](//evil.com/phish)")).toEqual([])
    expect(links("[x](/\\evil.com)")).toEqual([])
  })
  it("el HTML queda como texto (React lo escapa al pintarlo)", () => {
    const n = inline("<script>alert(1)</script> **hola**")
    expect(n[0]).toEqual({ t: "text", v: "<script>alert(1)</script> " })
  })
})

describe("cifrado AES-256-GCM", () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  it("ida y vuelta con IV distinto cada vez", () => {
    const a = encrypt("clave-secreta"), b = encrypt("clave-secreta")
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe("clave-secreta")
  })
  it("detecta datos alterados y etiquetas recortadas", () => {
    const [v, iv, tag, data] = encrypt("hola").split(".")
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1)
    expect(() => decrypt([v, iv, tag, flip(data)].join("."))).toThrow()
    expect(() => decrypt([v, iv, tag.slice(0, 6), data].join("."))).toThrow()
    expect(() => decrypt("v2.x.y.z")).toThrow()
  })
})
