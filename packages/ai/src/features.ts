// Funciones de Mirai que usan IA: nombre para las métricas, tipo de modelo, límite de respuesta y caché.
// Puro y sin secretos: lo usan el servidor (lib/ai/run.ts) y las pantallas de uso (Ajustes y consola).

/**
 * - `tier`: "simple" (clasificar, extraer, reescribir: modelo barato del proveedor) · "razonamiento" (consejos y
 *   resúmenes: el modelo configurado) · "vision" (fotos y PDF: el modelo configurado, que lee imágenes).
 * - `maxOut`: tope de tokens de salida. Es un techo contra respuestas desbocadas (solo se paga lo que se usa); deja
 *   margen porque en los modelos que "piensan" (Gemini 2.5, GPT-5) el razonamiento también cuenta como salida.
 * - `cacheH`: horas que se reutiliza una respuesta idéntica (0 = nunca; el chat depende de la conversación).
 */
export const AI_FEATURES = {
  chat: { label: "Chat con el asesor", icon: "message-circle", tier: "razonamiento", maxOut: 1200, cacheH: 0 },
  chat_titulo: { label: "Chat: título de la conversación", icon: "pencil", tier: "simple", maxOut: 60, cacheH: 24 * 7 },
  consejero_interpretar: { label: "Consejero: entender la decisión", icon: "scale", tier: "simple", maxOut: 800, cacheH: 24 },
  consejero_analizar: { label: "Consejero: análisis", icon: "scale", tier: "razonamiento", maxOut: 2000, cacheH: 12 },
  categorizar: { label: "Categoría y gasto hormiga", icon: "tag", tier: "simple", maxOut: 2000, cacheH: 24 * 7 },
  factura: { label: "Leer factura", icon: "receipt", tier: "vision", maxOut: 800, cacheH: 24 * 7 },
  documento_prestamo: { label: "Leer documento de préstamo", icon: "file-text", tier: "vision", maxOut: 1200, cacheH: 24 * 7 },
  comprobante: { label: "Leer comprobante de pago", icon: "file-check", tier: "vision", maxOut: 800, cacheH: 24 * 7 },
  correo_banco: { label: "Compras del correo del banco", icon: "mail", tier: "simple", maxOut: 2500, cacheH: 24 },
  resumen_mes: { label: "Resumen del mes", icon: "chart-column", tier: "razonamiento", maxOut: 1500, cacheH: 6 },
  categoria_nueva: { label: "Sugerir categoría", icon: "tag", tier: "simple", maxOut: 600, cacheH: 24 * 7 },
  entidad: { label: "Identificar banco o entidad", icon: "landmark", tier: "simple", maxOut: 600, cacheH: 24 * 30 },
  cobro: { label: "Mejorar mensaje de cobro", icon: "send", tier: "simple", maxOut: 600, cacheH: 24 },
  prima: { label: "Plan para la prima", icon: "gift", tier: "razonamiento", maxOut: 1500, cacheH: 24 },
  frase_libre: { label: "Registrar con una frase", icon: "pencil", tier: "simple", maxOut: 500, cacheH: 12 },
  automatizacion: { label: "Automatizaciones", icon: "zap", tier: "razonamiento", maxOut: 800, cacheH: 6 },
  prueba: { label: "Probar conexión", icon: "plug", tier: "simple", maxOut: 20, cacheH: 0 },
  otro: { label: "Otras funciones", icon: "sparkles", tier: "razonamiento", maxOut: 1500, cacheH: 0 },
} as const satisfies Record<string, { label: string; icon: string; tier: "simple" | "razonamiento" | "vision"; maxOut: number; cacheH: number }>

export type AiFeature = keyof typeof AI_FEATURES
export type AiTier = (typeof AI_FEATURES)[AiFeature]["tier"]
export const AI_FEATURE_IDS = Object.keys(AI_FEATURES) as AiFeature[]
export const featureLabel = (f: string) => (AI_FEATURES as Record<string, { label: string }>)[f]?.label ?? f

export const FUENTE_LABEL: Record<string, string> = { ia: "IA", cache: "Respuesta guardada", algoritmo: "Cálculo de Mirai" }
