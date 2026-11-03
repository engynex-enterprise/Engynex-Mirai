import type { MetadataRoute } from "next"
import { PROTOCOL, PROTOCOL_ACTION, PWA_COLORS, PWA_DIR, PWA_ID, PWA_SHORTCUTS, PWA_START_URL, SHARE_ACTION, SHARE_FILE_FIELD } from "./config"

/** Campos del manifest que Next aún no tipa (Chrome/Edge los usan; los demás navegadores los ignoran). */
type Extra = {
  handle_links?: "auto" | "preferred" | "not-preferred"
  edge_side_panel?: { preferred_width?: number }
  file_handlers?: { action: string; accept: Record<string, string[]>; icons?: MetadataRoute.Manifest["icons"]; launch_type?: "single-client" | "multiple-clients" }[]
}
export type MiraiManifest = MetadataRoute.Manifest & Extra

const png = (src: string, size: number, purpose?: "any" | "maskable" | "monochrome") => ({ src, sizes: `${size}x${size}`, type: "image/png", ...(purpose ? { purpose } : {}) })

/** Archivos de imagen que el manifest necesita (la prueba revisa que existan en public/). */
export const MANIFEST_SCREENSHOTS = [
  { src: `${PWA_DIR}/capturas/escritorio-inicio.png`, sizes: "1280x800", form_factor: "wide" as const, label: "Inicio: cuánto te queda en la quincena y tus próximos pagos" },
  { src: `${PWA_DIR}/capturas/escritorio-balance.png`, sizes: "1280x800", form_factor: "wide" as const, label: "Balance: todo lo que entra y sale, por quincena o por mes" },
  { src: `${PWA_DIR}/capturas/celular-inicio.png`, sizes: "824x1830", form_factor: "narrow" as const, label: "Tu plata del día en el celular" },
  { src: `${PWA_DIR}/capturas/celular-gasto.png`, sizes: "824x1830", form_factor: "narrow" as const, label: "Registra un gasto en segundos o léelo de una foto" },
  { src: `${PWA_DIR}/capturas/celular-deudas.png`, sizes: "824x1830", form_factor: "narrow" as const, label: "Tus deudas y préstamos con su próxima cuota" },
]

/** Manifest de Mirai (app/manifest.ts lo sirve en /manifest.webmanifest). */
export function buildManifest(): MiraiManifest {
  return {
    id: PWA_ID,
    name: "Mirai · Tu futuro financiero",
    short_name: "Mirai",
    description: "Finanzas personales y familiares para Colombia, explicadas en palabras simples: gastos, ingresos, deudas, metas e impuestos.",
    lang: "es-CO",
    dir: "ltr",
    start_url: PWA_START_URL,
    scope: "/",
    display: "standalone",
    // Escritorio: si la persona lo activa, la barra de título se integra a Mirai (features/pwa/title-bar.tsx).
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    // No se fuerza la orientación (iPad y tabletas en horizontal).
    orientation: "any",
    theme_color: PWA_COLORS.themeLight,
    background_color: PWA_COLORS.backgroundLight,
    categories: ["finance", "productivity", "lifestyle"],
    prefer_related_applications: false,
    icons: [
      png(`${PWA_DIR}/icon-192.png`, 192, "any"),
      png(`${PWA_DIR}/icon-512.png`, 512, "any"),
      png(`${PWA_DIR}/maskable-192.png`, 192, "maskable"),
      png(`${PWA_DIR}/maskable-512.png`, 512, "maskable"),
      png(`${PWA_DIR}/monochrome-512.png`, 512, "monochrome"),
    ],
    screenshots: MANIFEST_SCREENSHOTS.map((s) => ({ ...s, type: "image/png" })),
    shortcuts: PWA_SHORTCUTS.map((s) => ({
      name: s.name, short_name: s.short_name, description: s.description, url: s.url,
      icons: [png(`${PWA_DIR}/atajos/${s.id}.png`, 96, "any"), png(`${PWA_DIR}/atajos/${s.id}-192.png`, 192, "any")],
    })),
    // Compartir a Mirai una foto o PDF de una factura (o un texto) abre Registrar gasto con la lectura por IA.
    share_target: {
      action: SHARE_ACTION,
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: SHARE_FILE_FIELD, accept: ["image/*", "application/pdf", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic"] }] },
    },
    // Enlaces web+mirai://gasto, web+mirai://ingreso… (lib/pwa/links.ts).
    protocol_handlers: [{ protocol: PROTOCOL, url: `${PROTOCOL_ACTION}?u=%s` }],
    // Escritorio: abrir un extracto CSV o Excel con Mirai lo lleva a Importar.
    file_handlers: [{
      action: "/importar",
      accept: {
        "text/csv": [".csv"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      },
      icons: [png(`${PWA_DIR}/icon-192.png`, 192, "any")],
      launch_type: "single-client",
    }],
    // Abrir otro acceso directo o un enlace con Mirai abierto reutiliza la ventana (features/pwa/launch.ts lo navega).
    launch_handler: { client_mode: ["focus-existing", "auto"] },
    handle_links: "preferred",
    edge_side_panel: { preferred_width: 420 },
  }
}
