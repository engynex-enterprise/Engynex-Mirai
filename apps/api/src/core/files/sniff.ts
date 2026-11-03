// Tipo real del archivo por sus primeros bytes ("números mágicos"). El tipo que manda el navegador se puede falsificar:
// al completar una subida se compara con el contenido y, si no coincide, el archivo se borra (FilesService).
// Solo los tipos que Mirai acepta: PDF, PNG, JPEG, GIF, WebP, HEIC/HEIF, AVIF y JSON.

/** Bytes que hacen falta para reconocer cualquiera de los tipos (rango 0..SNIFF_BYTES-1). */
export const SNIFF_BYTES = 32

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))

/** Tipo reconocido o null si no es ninguno de los conocidos. */
export function sniffMime(b: Uint8Array): string | null {
  if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return "application/pdf"
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png"
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "image/gif"
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp"
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12)
    if (brand === "avif" || brand === "avis") return "image/avif"
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "image/heic"
    if (["mif1", "msf1"].includes(brand)) return "image/heif"
  }
  const t = ascii(b, 0, Math.min(b.length, SNIFF_BYTES)).replace(/^﻿/, "").trimStart()
  if (t.startsWith("{") || t.startsWith("[")) return "application/json"
  return null
}

/** Familias equivalentes (HEIC y HEIF comparten contenedor; algunos celulares declaran uno y guardan el otro). */
const SAME: Record<string, string> = { "image/heif": "image/heic", "image/jpg": "image/jpeg" }
const norm = (m: string) => SAME[m.toLowerCase()] ?? m.toLowerCase()

/** ¿El contenido corresponde al tipo declarado? Si el tipo declarado no es uno que sepamos reconocer, no se juzga. */
export function contentMatches(declared: string, head: Uint8Array): boolean {
  const d = norm(declared)
  const known = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/avif", "application/json"]
  if (!known.includes(d)) return true
  const s = sniffMime(head)
  return !!s && norm(s) === d
}
