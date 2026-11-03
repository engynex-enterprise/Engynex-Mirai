// Mirai como app instalada (PWA): colores, accesos directos y rutas especiales. Puro y sin alias "@/" para que lo
// usen el manifest (app/manifest.ts), el script de íconos (scripts/pwa-assets.mjs lo importa con Node) y las pruebas.
// Qué funciona en cada plataforma: docs/PWA.md.

/** Colores de la app instalada. El claro y el oscuro son los del fondo de Mirai (tope del degradado de globals.css). */
export const PWA_COLORS = {
  /** Barra de estado y de título (Android, escritorio) en modo claro. */
  themeLight: "#F8EDF1",
  /** Lo mismo en modo oscuro. */
  themeDark: "#1E1B21",
  /** Fondo de la pantalla de carga de Android y de los splash de iPhone. */
  backgroundLight: "#F3EFF6",
  backgroundDark: "#1A1A1F",
  /** Marca Engynex: fondo de los íconos (navy) y acentos. */
  navy: "#1F2B4B",
  lime: "#9EDB4E",
  forest: "#3F7A1E",
} as const

/** Carpeta pública de los íconos, splash y capturas que genera `npm run pwa:assets`. */
export const PWA_DIR = "/pwa"

export type PwaShortcut = {
  /** Clave del archivo del ícono: public/pwa/atajos/<id>.png */
  id: string
  name: string
  short_name: string
  description: string
  url: string
  /** Isotipo de lib/data/iso.json que va en el ícono. */
  iso: string
  /** Fondo pastel del ícono (se lee bien en lanzadores claros y oscuros). */
  tint: string
  /** Lleva el "+" verde de "crear algo nuevo". */
  plus: boolean
}

/**
 * Accesos directos del ícono instalado (mantener presionado en Android, clic derecho en Windows/macOS), por importancia:
 * Android muestra los primeros 4 o 5 según el lanzador; Windows hasta 10. Cada uno abre el formulario con ?nuevo=1
 * (lo lee `useNewParam()` en la vista de la sección).
 */
export const PWA_SHORTCUTS: PwaShortcut[] = [
  { id: "gasto", name: "Registrar gasto", short_name: "Gasto", description: "Anota algo que acabas de pagar o lee una factura con foto", url: "/gastos?nuevo=1", iso: "gastos", tint: "#FDE7EB", plus: true },
  { id: "ingreso", name: "Registrar ingreso", short_name: "Ingreso", description: "Tu salario, honorarios, arriendo o una plata que te entró", url: "/ingresos?nuevo=1", iso: "ingresos", tint: "#E7F5D9", plus: true },
  { id: "deuda", name: "Nueva deuda (Le debo)", short_name: "Deuda", description: "Un crédito, un fiado, un empeño o plata que le debes a alguien", url: "/le-debo?nuevo=1", iso: "le-debo", tint: "#FFF2D1", plus: true },
  { id: "prestamo", name: "Nuevo préstamo (Me deben)", short_name: "Préstamo", description: "Plata que le prestaste a alguien, para que no se te olvide cobrar", url: "/me-deben?nuevo=1", iso: "me-deben", tint: "#E5EFFB", plus: true },
  { id: "recordatorio", name: "Nuevo recordatorio", short_name: "Recordatorio", description: "Una fecha importante: un pago, un impuesto o un vencimiento", url: "/calendario?nuevo=1", iso: "recordatorios", tint: "#EFE7FB", plus: true },
  { id: "consejero", name: "Consejero IA", short_name: "Consejero", description: "Pregúntale a Mirai si te conviene una compra o un crédito", url: "/consejero", iso: "consejero", tint: "#E3F3EF", plus: false },
  { id: "dashboard", name: "Dashboard", short_name: "Dashboard", description: "Tus números en gráficas para decidir", url: "/dashboard", iso: "dashboard", tint: "#E8E9F9", plus: false },
]

/** Página de inicio de la app instalada: la marca ?source=pwa se quita sola al abrir (features/pwa/pwa-runtime.tsx). */
export const PWA_START_URL = "/inicio?source=pwa"
/** Identidad de la app: era la start_url de antes ("/inicio"); no cambiarla o las instalaciones actuales se duplican. */
export const PWA_ID = "/inicio"

/** Recibe lo que se comparte a Mirai desde otras apps (service worker; app/compartir/route.ts si no hay SW). */
export const SHARE_ACTION = "/compartir"
/** Nombre del campo del archivo compartido en el formulario multipart. */
export const SHARE_FILE_FIELD = "archivo"
/** Caché donde el service worker deja el archivo compartido para que lo lea el formulario de gasto. */
export const SHARE_CACHE = "mirai-compartido"
export const SHARE_FILE_KEY = "/compartido/archivo"
export const SHARE_META_KEY = "/compartido/datos"

/** Enlaces web+mirai://… (app/abrir/route.ts). */
export const PROTOCOL = "web+mirai"
export const PROTOCOL_ACTION = "/abrir"

/** Página sin conexión (public/offline.html, la guarda el service worker al instalarse). */
export const OFFLINE_URL = "/offline.html"
