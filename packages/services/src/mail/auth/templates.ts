// Plantillas de los correos de auth propio (v7, V7-A; docs/arquitectura/v7-gcp-total.md §3.1.8). Español de Colombia,
// tuteo, lenguaje simple, con la marca de siempre (brandEmail). Puras: no envían nada (eso lo hace ./send.ts).
// Remitente: no-responder@mirai.engynex.com (dominio verificado en Resend: SPF, DKIM y DMARC).
import { brandEmail } from "../../notify/email"

export type AuthMailKind =
  | "verificar_correo"
  | "enlace_entrar"
  | "recuperar_clave"
  | "cambio_correo_aprobar"
  | "cambio_correo_confirmar"
  | "correo_cambiado"
  | "cuenta_suspendida"
  | "nuevo_inicio"
  | "invitacion"

export type AuthMail = { kind: AuthMailKind; subject: string; html: string; text: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const hola = (nombre?: string | null) => `<p style="margin:0 0 12px">Hola${nombre ? `, ${esc(nombre.split(" ")[0] ?? "")}` : ""}:</p>`
const boton = (url: string, label: string) =>
  `<p style="margin:0 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#1F2B4B;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`
const copia = (url: string) =>
  `<p style="margin:0 0 12px;font-size:13px;color:#616161">Si el botón no abre, copia y pega esta dirección en tu navegador:<br><span style="word-break:break-all">${esc(url)}</span></p>`
const FOOT_AUTH = "Recibes este correo porque alguien usó tu correo en Mirai. Si no fuiste tú, ignóralo: sin abrir el enlace no cambia nada."
const minutos = (s: number) => (s >= 3600 ? `${Math.round(s / 3600)} hora${s >= 7200 ? "s" : ""}` : `${Math.round(s / 60)} minutos`)

export type LinkMail = { url: string; nombre?: string | null; /** Segundos que dura el enlace. */ expiresIn?: number }

export function verifyEmailMail(m: LinkMail): AuthMail {
  const dura = minutos(m.expiresIn ?? 86_400)
  return {
    kind: "verificar_correo",
    subject: "Confirma tu correo para empezar en Mirai",
    html: brandEmail("Confirma tu correo", `${hola(m.nombre)}
<p style="margin:0 0 16px">Gracias por crear tu cuenta en Mirai. Abre este enlace para confirmar que este correo es tuyo y empezar.</p>
${boton(m.url, "Confirmar mi correo")}${copia(m.url)}
<p style="margin:0;font-size:13px;color:#616161">El enlace sirve durante ${dura}.</p>`, { footer: FOOT_AUTH }),
    text: `Confirma tu correo para empezar en Mirai: ${m.url} (sirve durante ${dura}).`,
  }
}

export function magicLinkMail(m: LinkMail): AuthMail {
  const dura = minutos(m.expiresIn ?? 3600)
  return {
    kind: "enlace_entrar",
    subject: "Tu enlace para entrar a Mirai",
    html: brandEmail("Entra a Mirai sin contraseña", `${hola(m.nombre)}
<p style="margin:0 0 16px">Pediste entrar con un enlace. Ábrelo desde este mismo dispositivo:</p>
${boton(m.url, "Entrar a Mirai")}${copia(m.url)}
<p style="margin:0;font-size:13px;color:#616161">El enlace sirve una sola vez durante ${dura}. Si no lo pediste, ignora este correo: tu cuenta sigue segura.</p>`, { footer: FOOT_AUTH }),
    text: `Tu enlace para entrar a Mirai (una sola vez, durante ${dura}): ${m.url}`,
  }
}

export function resetPasswordMail(m: LinkMail): AuthMail {
  const dura = minutos(m.expiresIn ?? 3600)
  return {
    kind: "recuperar_clave",
    subject: "Crea una contraseña nueva para Mirai",
    html: brandEmail("Recupera tu cuenta", `${hola(m.nombre)}
<p style="margin:0 0 16px">Pediste crear una contraseña nueva. Abre este enlace y escríbela:</p>
${boton(m.url, "Crear contraseña nueva")}${copia(m.url)}
<p style="margin:0;font-size:13px;color:#616161">El enlace sirve durante ${dura}. Al cambiarla cerramos tu sesión en los demás dispositivos. Si no lo pediste, ignora este correo.</p>`, { footer: FOOT_AUTH }),
    text: `Crea una contraseña nueva para Mirai (durante ${dura}): ${m.url}`,
  }
}

/** Paso 1 del cambio de correo: al correo ACTUAL, para aprobarlo (con "No fui yo"). */
export function changeEmailApproveMail(m: LinkMail & { newEmail: string; cancelUrl: string }): AuthMail {
  return {
    kind: "cambio_correo_aprobar",
    subject: "¿Cambias el correo de tu cuenta de Mirai?",
    html: brandEmail("Aprueba el cambio de correo", `${hola(m.nombre)}
<p style="margin:0 0 16px">Pediste que tu cuenta de Mirai use el correo <b>${esc(m.newEmail)}</b>. Para seguir, apruébalo desde aquí. Después te enviaremos otro enlace a ese correo nuevo.</p>
${boton(m.url, "Sí, cambiar mi correo")}
<p style="margin:0 0 16px;font-size:14px">¿No fuiste tú? <a href="${esc(m.cancelUrl)}" style="color:#3F7A1E;font-weight:600">No fui yo: cancelar el cambio</a> y cambia tu contraseña.</p>
${copia(m.url)}`, { footer: FOOT_AUTH }),
    text: `Pediste cambiar el correo de tu cuenta de Mirai a ${m.newEmail}. Apruébalo: ${m.url} · ¿No fuiste tú? Cancélalo: ${m.cancelUrl}`,
  }
}

/** Paso 2: al correo NUEVO, para confirmarlo. */
export function changeEmailConfirmMail(m: LinkMail & { newEmail: string }): AuthMail {
  return {
    kind: "cambio_correo_confirmar",
    subject: "Confirma tu correo nuevo en Mirai",
    html: brandEmail("Confirma tu correo nuevo", `${hola(m.nombre)}
<p style="margin:0 0 16px">Abre este enlace para que <b>${esc(m.newEmail)}</b> sea el correo de tu cuenta de Mirai. Desde ahí entrarás con este correo.</p>
${boton(m.url, "Confirmar mi correo nuevo")}${copia(m.url)}`, { footer: FOOT_AUTH }),
    text: `Confirma tu correo nuevo en Mirai: ${m.url}`,
  }
}

/** Aviso al correo viejo cuando el cambio terminó. */
export function emailChangedMail(m: { nombre?: string | null; newEmail: string; supportUrl: string }): AuthMail {
  return {
    kind: "correo_cambiado",
    subject: "Cambiamos el correo de tu cuenta de Mirai",
    html: brandEmail("Tu cuenta tiene un correo nuevo", `${hola(m.nombre)}
<p style="margin:0 0 16px">Desde ahora tu cuenta de Mirai usa <b>${esc(m.newEmail)}</b>. Este correo ya no sirve para entrar.</p>
<p style="margin:0 0 16px;font-size:14px">¿No fuiste tú? <a href="${esc(m.supportUrl)}" style="color:#3F7A1E;font-weight:600">Escríbenos de inmediato</a>.</p>`, { footer: FOOT_AUTH }),
    text: `Cambiamos el correo de tu cuenta de Mirai a ${m.newEmail}. ¿No fuiste tú? Escríbenos: ${m.supportUrl}`,
  }
}

export function accountSuspendedMail(m: { nombre?: string | null; supportUrl: string }): AuthMail {
  return {
    kind: "cuenta_suspendida",
    subject: "Suspendimos tu cuenta de Mirai",
    html: brandEmail("Tu cuenta está suspendida", `${hola(m.nombre)}
<p style="margin:0 0 16px">Suspendimos tu cuenta de Mirai y cerramos tus sesiones. Tus datos no se borraron.</p>
<p style="margin:0;font-size:14px">Si crees que es un error, <a href="${esc(m.supportUrl)}" style="color:#3F7A1E;font-weight:600">escríbenos</a>.</p>`, { footer: FOOT_AUTH }),
    text: `Suspendimos tu cuenta de Mirai. Si crees que es un error, escríbenos: ${m.supportUrl}`,
  }
}

export function newSignInMail(m: { nombre?: string | null; dispositivo: string; cuando: Date; securityUrl: string }): AuthMail {
  const cuando = m.cuando.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" })
  return {
    kind: "nuevo_inicio",
    subject: "Entraste a Mirai desde un dispositivo nuevo",
    html: brandEmail("Nuevo inicio de sesión", `${hola(m.nombre)}
<p style="margin:0 0 16px">Entraste a Mirai desde <b>${esc(m.dispositivo)}</b> el ${esc(cuando)}.</p>
<p style="margin:0;font-size:14px">¿No fuiste tú? <a href="${esc(m.securityUrl)}" style="color:#3F7A1E;font-weight:600">Cierra esa sesión y cambia tu contraseña</a>.</p>`, { footer: FOOT_AUTH }),
    text: `Entraste a Mirai desde ${m.dispositivo} el ${cuando}. ¿No fuiste tú? ${m.securityUrl}`,
  }
}

/** Invitación de la consola: la cuenta ya existe sin contraseña; el enlace entra y confirma el correo. */
export function invitationMail(m: LinkMail): AuthMail {
  return {
    kind: "invitacion",
    subject: "Te invitaron a Mirai",
    html: brandEmail("Te invitaron a Mirai", `${hola(m.nombre)}
<p style="margin:0 0 16px">Mirai te ayuda a ordenar las finanzas de tu hogar en palabras simples. Abre este enlace para entrar; después puedes crear una contraseña o conectar tu cuenta de Google.</p>
${boton(m.url, "Entrar a Mirai")}${copia(m.url)}`, { footer: "Recibes este correo porque alguien del equipo de Mirai te invitó. Si no lo esperabas, ignóralo." }),
    text: `Te invitaron a Mirai. Entra aquí: ${m.url}`,
  }
}
