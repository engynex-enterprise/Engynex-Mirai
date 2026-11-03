// Tu cuenta: formas de entrar, cambio de correo y pasarse a otra cuenta. Puro e isomórfico (cliente, servidor y pruebas).
//
// En Supabase Auth una cuenta tiene UN correo (auth.users.email) y varias "identidades": `email` (correo) y `google`
// (una por cada cuenta de Google conectada). La contraseña es aparte (encrypted_password). El enlace mágico llega
// siempre al correo de la cuenta. Los datos (hogares, libros, movimientos) cuelgan del id de la cuenta, no del correo:
// cambiar el correo o la cuenta de Google NO pierde nada.

export type Identity = { id: string; provider: string; email: string | null; last_sign_in_at: string | null; created_at: string | null }
/** Lo que devuelve la función SQL my_account(). */
export type AccountState = {
  email: string | null
  new_email: string | null
  email_change_sent_at: string | null
  /** 1 = con "cambio de correo seguro" ya se confirmó uno de los dos enlaces. */
  email_change_confirm_status: number
  has_password: boolean
  created_at: string | null
  last_sign_in_at: string | null
  identities: Identity[]
}

export type MethodKind = "google" | "password" | "magic"
export type Method = {
  key: string
  kind: MethodKind
  label: string
  /** Correo con el que entra (Google) o el de la cuenta. */
  detail: string
  lastAt: string | null
  /** Para Google: id de la identidad (unlinkIdentity). */
  identityId?: string
  removable: boolean
  /** Por qué no se puede quitar (tooltip). */
  reason?: string
}

const lower = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase()
const newest = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : a > b ? a : b)

export const googleIdentities = (s: AccountState) => s.identities.filter((i) => i.provider === "google")

/** Formas reales de entrar: cada cuenta de Google + la contraseña. El enlace mágico depende del correo, no cuenta. */
export const waysToEnter = (s: AccountState) => googleIdentities(s).length + (s.has_password ? 1 : 0)

export const LAST_METHOD_MSG = "Es tu única forma de entrar. Agrega otra (una contraseña o tu otra cuenta de Google) antes de quitarla."

/** ¿Se puede quitar esta forma de entrar? Nunca la última. */
export function canRemove(s: AccountState, m: { kind: MethodKind; identityId?: string }): { ok: true } | { ok: false; msg: string } {
  if (m.kind === "magic") return { ok: false, msg: "El enlace mágico llega a tu correo. Para dejar de usarlo, cambia el correo de tu cuenta." }
  if (m.kind === "google" && !googleIdentities(s).some((i) => i.id === m.identityId)) return { ok: false, msg: "Esa cuenta de Google ya no está conectada." }
  if (m.kind === "password" && !s.has_password) return { ok: false, msg: "No tienes contraseña." }
  if (m.kind === "password" && !googleIdentities(s).length) return { ok: false, msg: LAST_METHOD_MSG }
  if (waysToEnter(s) <= 1) return { ok: false, msg: LAST_METHOD_MSG }
  return { ok: true }
}

/** Lista para la tarjeta "Cuentas conectadas". */
export function signInMethods(s: AccountState): Method[] {
  const out: Method[] = []
  for (const g of googleIdentities(s)) {
    const r = canRemove(s, { kind: "google", identityId: g.id })
    out.push({ key: `google:${g.id}`, kind: "google", label: "Google", detail: g.email || "Cuenta de Google", lastAt: g.last_sign_in_at, identityId: g.id, removable: r.ok, reason: r.ok ? undefined : r.msg })
  }
  const emailId = s.identities.find((i) => i.provider === "email")
  if (s.has_password) {
    const r = canRemove(s, { kind: "password" })
    out.push({ key: "password", kind: "password", label: "Correo y contraseña", detail: s.email ?? "", lastAt: emailId?.last_sign_in_at ?? null, removable: r.ok, reason: r.ok ? undefined : r.msg })
  }
  out.push({ key: "magic", kind: "magic", label: "Enlace mágico", detail: s.email ?? "", lastAt: s.has_password ? null : emailId?.last_sign_in_at ?? null, removable: false, reason: canRemove(s, { kind: "magic" }).ok ? undefined : "El enlace mágico llega a tu correo. Para dejar de usarlo, cambia el correo de tu cuenta." })
  return out
}

/** Última vez que entró con cualquier forma. */
export const lastSignIn = (s: AccountState) => s.identities.reduce<string | null>((a, i) => newest(a, i.last_sign_in_at), s.last_sign_in_at)

// ── Cambio de correo ─────────────────────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Valida el correo nuevo frente al actual. */
export function checkNewEmail(current: string | null | undefined, next: string): { ok: true; email: string } | { ok: false; msg: string } {
  const e = lower(next)
  if (!e) return { ok: false, msg: "Escribe tu correo nuevo." }
  if (e.length > 254 || !EMAIL_RE.test(e)) return { ok: false, msg: "Ese correo no parece válido. Revísalo." }
  if (e === lower(current)) return { ok: false, msg: "Ese ya es el correo de tu cuenta." }
  return { ok: true, email: e }
}

export type EmailChange = { estado: "ninguno" } | { estado: "pendiente"; to: string; sentAt: string | null; falta: "ambos" | "uno" }

/** Estado del cambio de correo. Con "cambio seguro" hay que confirmar en los dos correos (el viejo y el nuevo). */
export function emailChangeState(s: Pick<AccountState, "new_email" | "email_change_sent_at" | "email_change_confirm_status">): EmailChange {
  if (!s.new_email) return { estado: "ninguno" }
  return { estado: "pendiente", to: s.new_email, sentAt: s.email_change_sent_at, falta: s.email_change_confirm_status >= 1 ? "uno" : "ambos" }
}

// ── "Mi correo de Google ya no lo uso" ───────────────────────────────────────────────────────────────────────────

export type MoveStep = { key: "correo" | "entrar" | "quitar"; title: string; desc: string; done: boolean; blocked?: string }

/**
 * Pasos para seguir en la MISMA cuenta con un correo nuevo (sin crear una cuenta vacía):
 *  1. El correo de la cuenta pasa a ser el nuevo (llegan ahí los avisos y el enlace mágico).
 *  2. Una forma de entrar que no dependa del correo viejo: contraseña o la cuenta de Google nueva.
 *  3. Quitar la cuenta de Google vieja (cuando ya no es la única forma de entrar).
 * `oldGoogle`: correo de la cuenta de Google que ya no usa.
 */
export function moveSteps(s: AccountState, newEmail: string, oldGoogle?: string | null): MoveStep[] {
  const ne = lower(newEmail)
  const old = lower(oldGoogle)
  const others = googleIdentities(s).filter((g) => lower(g.email) !== old)
  const enNuevo = lower(s.email) === ne
  const pendiente = lower(s.new_email) === ne
  const entra = s.has_password || others.length > 0
  const viejaConectada = !!old && googleIdentities(s).some((g) => lower(g.email) === old)
  return [
    { key: "correo", title: "Cambia el correo de tu cuenta", desc: pendiente ? `Falta confirmar el enlace que te enviamos a ${ne}.` : `Así los avisos y el enlace mágico llegan a ${ne || "tu correo nuevo"}.`, done: enNuevo },
    { key: "entrar", title: "Ten otra forma de entrar", desc: "Crea una contraseña o conecta tu otra cuenta de Google. Así entras aunque dejes de usar la vieja.", done: entra },
    { key: "quitar", title: "Quita la cuenta de Google vieja", desc: old ? `Desconecta ${old} de Mirai.` : "Desconecta la cuenta de Google que ya no usas.", done: !!old && !viejaConectada, blocked: entra ? undefined : "Primero crea una contraseña o conecta otra cuenta de Google." },
  ]
}

// ── Reautenticación ──────────────────────────────────────────────────────────────────────────────────────────────

/** Minutos desde el último inicio de sesión para acciones delicadas (quitar una forma de entrar). */
export const REAUTH_MIN = 60

/** ¿Entró hace poco? `amr` del JWT de Supabase: [{ method, timestamp (segundos) }]. */
export function isRecentAuth(amr: unknown, now = Date.now(), minutes = REAUTH_MIN): boolean {
  if (!Array.isArray(amr)) return false
  const last = Math.max(0, ...amr.map((a) => Number((a as { timestamp?: unknown })?.timestamp) || 0))
  return last > 0 && now - last * 1000 <= minutes * 60_000
}

// ── Actividad de seguridad ───────────────────────────────────────────────────────────────────────────────────────

export type AccountEvent = { id: number | string; kind: string; detail: Record<string, unknown> | null; created_at: string; ip?: string | null; user_agent?: string | null }

const prov = (p: unknown) => (p === "google" ? "Google" : p === "email" ? "tu correo" : String(p ?? "otra cuenta"))

/** Texto e ícono de cada evento (lista "Actividad de seguridad"). */
export function eventText(e: AccountEvent): { icon: string; text: string; tone: "ok" | "warn" | "info" | "gray" } {
  const d = e.detail ?? {}
  switch (e.kind) {
    case "inicio": return { icon: "user-round-check", text: "Iniciaste sesión", tone: "gray" }
    case "correo_cambiado": return { icon: "mail-check", text: `Cambiaste el correo de tu cuenta a ${d.despues ?? "uno nuevo"}`, tone: "warn" }
    case "correo_solicitado": return { icon: "mail", text: `Pediste cambiar tu correo a ${d.correo ?? "uno nuevo"}`, tone: "info" }
    case "correo_cancelado": return { icon: "mail", text: `Cancelaste el cambio de correo a ${d.correo ?? "otro correo"}`, tone: "gray" }
    case "contrasena": return { icon: "key-round", text: d.accion === "creada" ? "Creaste una contraseña" : d.accion === "quitada" ? "Quitaste tu contraseña" : "Cambiaste tu contraseña", tone: "warn" }
    case "metodo_conectado": return { icon: "link", text: `Conectaste ${prov(d.provider)}${d.provider === "google" && d.email ? ` (${d.email})` : ""}`, tone: "info" }
    case "metodo_quitado": return { icon: "unplug", text: `Quitaste ${prov(d.provider)}${d.provider === "google" && d.email ? ` (${d.email})` : ""}`, tone: "warn" }
    case "sesiones_cerradas": return { icon: "log-out", text: "Cerraste sesión en todos los dispositivos", tone: "warn" }
    case "sesion_cerrada": return { icon: "log-out", text: "Cerraste la sesión de otro dispositivo", tone: "gray" }
    case "hogar_pasado": return { icon: "crown", text: `Le pasaste el hogar “${d.hogar ?? ""}” a ${d.a ?? "otra persona"}`, tone: "warn" }
    case "hogar_recibido": return { icon: "crown", text: `Ahora eres dueño de “${d.hogar ?? ""}” (te lo pasó ${d.de ?? "otra persona"})`, tone: "ok" }
    case "hogar_salida": return { icon: "log-out", text: `Saliste del hogar “${d.hogar ?? ""}”`, tone: "gray" }
    case "hogar_borrado": return { icon: "trash-2", text: `Borraste el hogar “${d.hogar ?? ""}”`, tone: "warn" }
    default: return { icon: "shield-check", text: "Cambio en tu cuenta", tone: "gray" }
  }
}

/** Dispositivo en palabras simples a partir del user-agent. */
export function deviceName(ua: string | null | undefined): string {
  const u = String(ua ?? "")
  if (!u) return "Dispositivo desconocido"
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : ""
  const br = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : ""
  return [br, os].filter(Boolean).join(" en ") || "Navegador"
}
