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

export const APP_VER = "5.3"

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

const V51: Release = {
  v: "5.1", f: "1 nov 2026", t: "Un Mirai más tuyo: nuevo diseño y perfil",
  items: [
    ["new", "Elige tu avatar", "Toca tu foto en Perfil y escoge entre 10 avatares de Mirai, tu foto de Google, una foto tuya o tus iniciales. Cada integrante de la familia también puede tener el suyo."],
    ["new", "Tu foto de Google", "Si entras con Google y no tienes foto, Mirai usa la de tu cuenta. También puedes vincular Google desde Perfil."],
    ["new", "Perfil más completo", "Apodo para saludarte, fecha de nacimiento (te saludamos en tu cumpleaños), color de portada, avance del perfil y tus cuentas conectadas."],
    ["new", "Logos de tus servicios", "Netflix, Spotify, Google, Telegram, Visa y muchos más aparecen con su logo en Suscripciones, Tarjetas e Integraciones."],
    ["imp", "Nuevo diseño", "Fondo con degradado, menú y tarjetas translúcidas, y un banner ilustrado en cada sección."],
    ["fix", "Formularios que no se borran", "Si giras el celular o cambias el tamaño de la ventana con un formulario abierto, ya no se pierde lo que escribiste."],
    ["fix", "Borrar justo después de crear", "Ya puedes eliminar un registro apenas lo creas, sin esperar a que termine de guardarse."],
  ],
}
const V52: Release = {
  v: "5.2", f: "1 nov 2026", t: "Tu opinión cuenta",
  items: [
    ["new", "Califica Mirai y danos tu opinión", "En Ayuda › Tu opinión (o desde tu foto en el menú) puedes calificarnos, reportar algo que no funciona con una captura, pedir funciones o dejar sugerencias. Ves el estado de cada una y nuestra respuesta."],
    ["new", "Escoge el modelo de IA de una lista", "Al configurar Gemini, Groq, OpenRouter, Claude, OpenAI o el AI Gateway, el modelo se elige de la lista de tu cuenta, con el recomendado primero y los gratis aparte."],
    ["imp", "Reporta un error en un toque", "Si una sección falla, el botón Reportar este error nos lo envía con la página donde pasó."],
    ["imp", "Íconos con nombre en español", "Al elegir el ícono de una categoría, medio de pago o meta ves su nombre en español (Efectivo, Transferencia, Billetera…)."],
    ["fix", "Cambiar solo el ícono", "Cambiar el ícono de un medio de pago o una categoría sin tocar el nombre ya no muestra un error."],
    ["fix", "Mensajes de IA más claros", "Mirai ya no dice que el modelo no existe cuando el problema es la clave o el límite de uso del proveedor."],
  ],
}
const V53: Release = {
  v: "5.3", f: "1 nov 2026", t: "Mirai Premium",
  items: [
    ["new", "Planes Gratis y Premium", "Lo básico sigue gratis para siempre. Premium agrega la IA, la automatización con tu banco, los impuestos con tu contador y toda la familia con varios libros, sin anuncios. Míralo en Planes."],
    ["new", "Paga como prefieras", "Con tarjeta (se renueva sola y la cancelas cuando quieras) o con Nequi, PSE o Bancolombia por un mes o un año. Todo en Ajustes › Mi plan."],
    ["new", "Avisos de tu plan", "Te avisamos cuando se aprueba un pago, si se rechaza y 5 días antes de que venza Premium."],
    ["new", "Servicios incluidos por Mirai", "Algunas integraciones (como el correo o la IA) pueden venir incluidas por Mirai: las ves marcadas en Ajustes › Integraciones y funcionan sin configurar nada."],
    ["new", "Cupones de descuento", "Si tienes un cupón, escríbelo en Planes antes de pagar."],
    ["imp", "Términos actualizados", "Explicamos los pagos, el derecho de retracto de 5 días hábiles y los anuncios del plan gratis. Te pedimos aceptarlos de nuevo."],
  ],
}
export const RELEASES: Release[] = [V53, V52, V51, V5, ...(RELEASES_V4 as Release[])]

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
