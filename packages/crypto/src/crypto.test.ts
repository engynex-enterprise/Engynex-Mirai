import { afterEach, describe, expect, it } from "vitest"
import { decrypt, decryptWith, encrypt, encryptWith, isValidKey, mask, parseKey } from "./index"

// Llave de prueba (32 bytes = 0x07). Nunca uses una llave así fuera de las pruebas.
const KEY_B64 = Buffer.alloc(32, 7).toString("base64")
// Cifrado con apps/web/lib/crypto.ts de la v5 (antes de moverlo) y esa llave: la v6 debe descifrarlo igual.
const V5_BLOB = "v1.e3scq8tK5tn2Zyj8.IyposQwic6F-clBuD9kbCA._Sm3Jgi2cnb0ko9eO0tXToR0iJC-gP2kW7oRJpmz"
const V5_PLAIN = "sk-prueba-mirai-v5 ñandú ✓"

const prev = process.env.ENCRYPTION_KEY
afterEach(() => {
  process.env.ENCRYPTION_KEY = prev
})

describe("@mirai/crypto", () => {
  it("descifra un valor cifrado por la v5 (compatibilidad)", () => {
    expect(decryptWith(parseKey(KEY_B64), V5_BLOB)).toBe(V5_PLAIN)
    process.env.ENCRYPTION_KEY = KEY_B64
    expect(decrypt(V5_BLOB)).toBe(V5_PLAIN)
  })

  it("ida y vuelta, con IV distinto cada vez", () => {
    const k = parseKey(KEY_B64)
    const a = encryptWith(k, "secreto"), b = encryptWith(k, "secreto")
    expect(a).not.toBe(b)
    expect(a.split(".")).toHaveLength(4)
    expect(decryptWith(k, a)).toBe("secreto")
    process.env.ENCRYPTION_KEY = KEY_B64
    expect(decrypt(encrypt(""))).toBe("")
  })

  it("rechaza llaves de otro tamaño, formatos raros y datos alterados", () => {
    expect(() => parseKey("corta")).toThrow(/32 bytes/)
    expect(isValidKey(KEY_B64)).toBe(true)
    expect(isValidKey(undefined)).toBe(false)
    const k = parseKey(KEY_B64)
    expect(() => decryptWith(k, "v2.a.b.c")).toThrow(/desconocido/)
    expect(() => decryptWith(k, `${V5_BLOB}.extra`)).toThrow(/desconocido/)
    const [v, iv, tag, data] = V5_BLOB.split(".")
    expect(() => decryptWith(k, [v, iv, tag.slice(0, 10), data].join("."))).toThrow(/desconocido/)
    expect(() => decryptWith(k, [v, iv, tag, data.slice(0, -2) + "AA"].join("."))).toThrow()
    expect(() => decryptWith(parseKey(Buffer.alloc(32, 8).toString("base64")), V5_BLOB)).toThrow()
  })

  it("mask", () => {
    expect(mask("sk-abcdef1234")).toBe("••••1234")
    expect(mask("")).toBe("")
  })
})
