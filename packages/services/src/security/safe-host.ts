// Validación de destinos salientes (SSRF), solo servidor. Puro y síncrono salvo assertPublicHost (resuelve el DNS).
// Movido de apps/web/lib/security/safe-url.ts (F2-E: lo usan el correo SMTP de la web y de la API). Pruebas en
// apps/web/lib/security/security.test.ts (por la re-exportación).
import { isIP } from "node:net"

const BLOCKED_NAMES = /^(localhost|localhost\.localdomain|ip6-localhost|ip6-loopback|metadata|metadata\.google\.internal|instance-data|kubernetes(\.default)?(\.svc)?)$/i
const BLOCKED_SUFFIX = /\.(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i

function ipv4Private(ip: string) {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // "esta" red, privada, loopback, multicast y reservadas
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // enlace local y metadatos de la nube (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113)
  )
}

function ipv6Private(ip: string) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "")
  if (s === "::" || s === "::1") return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (mapped) return ipv4Private(mapped[1])
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return true // IPv4 mapeada en hexadecimal
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8:")
}

/** ¿La IP es privada, de loopback, de enlace local, de metadatos o reservada? */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip.replace(/^\[|\]$/g, ""))
  if (v === 4) return ipv4Private(ip)
  if (v === 6) return ipv6Private(ip)
  return false
}

/** ¿El nombre de host apunta (por su forma) a la red interna? Incluye IPs literales privadas y nombres reservados. */
export function isBlockedHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "")
  if (!h) return true
  if (isIP(h)) return isPrivateIp(h)
  // Formas numéricas que algunos clientes interpretan como IP (2130706433, 0x7f000001, 0177.0.0.1).
  if (/^((0x[0-9a-f]*|\d+)\.){0,3}(0x[0-9a-f]*|\d+)$/i.test(h)) return true
  return BLOCKED_NAMES.test(h) || BLOCKED_SUFFIX.test(h) || !h.includes(".")
}

/**
 * URL saliente segura (para llamadas del servidor con URLs que escriben personas o administradores): https
 * (o http si se permite), sin usuario ni contraseña y con un host público. Lanza un error legible si no.
 */
export function assertPublicUrl(raw: string, o: { allowHttp?: boolean } = {}): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error("La dirección no es válida.") }
  if (!(u.protocol === "https:" || (o.allowHttp && u.protocol === "http:"))) throw new Error("La dirección debe empezar por https://.")
  if (u.username || u.password) throw new Error("La dirección no puede llevar usuario ni contraseña.")
  if (isBlockedHost(u.hostname)) throw new Error("La dirección apunta a una red interna y no está permitida.")
  return u
}

/** Además de la forma del host, revisa a qué IPs resuelve (evita nombres públicos que apuntan a la red interna). */
export async function assertPublicHost(host: string): Promise<void> {
  if (isBlockedHost(host)) throw new Error("El servidor apunta a una red interna y no está permitido.")
  if (isIP(host)) return
  const { lookup } = await import("node:dns/promises")
  const addrs = await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new Error("No encontramos ese servidor.")
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("El servidor apunta a una red interna y no está permitido.")
}
