// Versión, novedades, preguntas frecuentes, guías y tour (k_ayuda.js de la v4).
// Las versiones anteriores se conservan literales (son historia); las respuestas vigentes se actualizan a la v5.
import RELEASES_V4 from "@/lib/data/legacy-releases.json"
import FAQ_V4 from "@/lib/data/legacy-faq.json"
import GUIDES_RAW from "@/lib/data/legacy-guides.json"
import TOUR_RAW from "@/lib/data/legacy-tour.json"

export type ReleaseItem = [kind: "new" | "imp" | "fix", title: string, desc: string]
export type Release = { v: string; f: string; t: string; items: ReleaseItem[] }
export type Faq = { c: string; q: string; a: string; go?: string; tab?: string }
export type Guide = { id: string; t: string; icon: string; go: string; min: number; s: string[]; tip?: string }

export const APP_VER = "5.0"

const V5: Release = {
  v: "5.0", f: "31 oct 2026", t: "Mirai en la nube: tu familia, en tiempo real",
  items: [
    ["new", "Cuentas de verdad", "Entras con correo y contraseña, enlace mágico o Google, con verificación en dos pasos opcional. Tus datos viven en la nube y se sincronizan entre tus dispositivos."],
    ["new", "Hogares y permisos", "Invita a tu pareja o a tus hijos a tu hogar como editores o lectores. Cada hogar puede tener varios libros."],
    ["new", "Cambios en vivo", "Si alguien de tu familia registra un gasto, lo ves al instante en tu pantalla."],
    ["new", "Integraciones en Ajustes", "Activa, ajusta y prueba la IA (Gemini, Groq, OpenRouter, Claude, OpenAI o el AI Gateway), el correo, Telegram, notificaciones push, WhatsApp, TRM, usura, festivos, cripto y acciones."],
    ["new", "Avisos aunque no abras Mirai", "Un resumen por correo, Telegram, push o WhatsApp a la hora que elijas, con la matriz de qué aviso va por qué canal."],
    ["new", "Acceso del contador en vivo", "Tu contador entra con un enlace privado, ve tu información actualizada sin poder cambiarla, descarga los documentos que subas y te deja notas."],
    ["new", "Documentos de la renta", "Sube tus certificados (PDF o foto) a cada documento de la lista. Quedan guardados de forma privada."],
    ["imp", "TRM, usura y festivos automáticos", "Se actualizan solos cada día desde la Superfinanciera y datos.gov.co."],
    ["imp", "Respaldos en la nube", "Crea copias, restaura y descarga todos tus datos (Ley 1581) desde Ajustes › Datos y cuenta."],
    ["imp", "Más rápido en el celular", "Instala Mirai en la pantalla de inicio y úsalo como una app."],
  ],
}

export const RELEASES: Release[] = [V5, ...(RELEASES_V4 as Release[])]

const FIX: Record<string, Partial<Faq>> = {
  "¿Cómo le doy acceso a mi contador?": { a: "Ve a <b>DIAN › Acceso de tu contador</b>, escribe su nombre, elige qué puede ver y hasta cuándo, y envíale el enlace. Solo puede ver, descargar los documentos y dejarte notas. Puedes quitarle el acceso cuando quieras." },
  "¿Qué servicio de correo uso: Gmail, SendGrid, Resend o SMTP?": { a: "<b>Gmail</b> si quieres algo rápido con tu cuenta (necesitas una contraseña de aplicación). <b>Resend</b> o <b>Brevo</b> tienen plan gratis. <b>SendGrid</b> si ya lo usas. <b>SMTP</b> si tienes el correo de tu hosting. Actívalo en <b>Ajustes › Integraciones</b> y elige qué avisos te llegan en Ajustes › Alertas.", tab: "integraciones" },
  "¿Dónde quedan guardadas mis claves?": { a: "En el servidor de Mirai, cifradas con AES-256. Tu navegador nunca las recibe: solo ve los últimos 4 caracteres.", tab: "integraciones" },
  "¿Puedo apagar la IA o usar ChatGPT o Gemini?": { a: "Sí. En <b>Ajustes › Inteligencia artificial</b> puedes apagarla, apagar funciones una por una y ordenar los proveedores. Gemini y Groq tienen plan gratis; para OpenAI o Claude se usa una clave de API (las suscripciones personales no se pueden vincular). Si un proveedor falla, Mirai prueba con el siguiente." },
  "La lectura con foto no funciona": { a: "Revisa que tengas un proveedor de IA activo en Ajustes › Integraciones y la lectura de fotos encendida en Ajustes › Inteligencia artificial. Usa una foto nítida, con buena luz y el documento completo. Si no lee bien, escribe los datos a mano.", go: "ajustes", tab: "ia" },
  "¿Dónde se guardan mis datos?": { a: "En la nube de Mirai (Supabase), protegidos con permisos por hogar: solo tú y las personas que invites pueden verlos. Puedes descargar una copia o eliminar tu cuenta en <b>Ajustes › Datos y cuenta</b>.", go: "ajustes", tab: "respaldo" },
}
export const FAQ: Faq[] = (FAQ_V4 as Faq[]).map((f) => ({ ...f, ...(FIX[f.q] ?? {}) }))
export const FAQ_CATS = [...new Set(FAQ.map((f) => f.c))]
export const GUIDES = GUIDES_RAW as Guide[]
export const TOUR = TOUR_RAW as { sel: string; t: string; d: string }[]
export const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "")
