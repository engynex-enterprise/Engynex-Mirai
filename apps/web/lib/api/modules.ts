// Interruptores de la web hacia la API (v6 F2-H). Cada clave es una entrada de platform_settings.api_rollout
// (packages/contracts/src/rollout.ts): "off" | "qa" | "admins" | "pct:N" | "on". Con todo apagado (lo normal) la web
// hace exactamente lo de siempre (Supabase directo, Server Actions y Route Handlers de Next).
// El procedimiento de encendido gradual y de apagado de emergencia está en docs/arquitectura/v6-f2h-encendido.md.

export const API_MODULES = {
  me: "Contexto del shell (getAppContext → GET /v1/me)",
  "book-tables": "CRUD genérico del libro: useList / useSave / useSoftDelete → /v1/books/:b/t/:tabla (acepta book-tables:<tabla>)",
  snapshot: "Libro para los cálculos (useBookData / loadBookPart: Inicio, Balance, Dashboard, Flujo…) → GET /v1/books/:b/snapshot",
  expenses: "Comandos de gastos (enlazar a un fijo, usar el fondo) en vez de las RPC del navegador",
  fixed: "Pagar / deshacer un fijo y cobrar una suscripción (RPC → comandos)",
  cards: "Compras y pagos de tarjeta (RPC → comandos)",
  savings: "Aportes a metas y movimientos del fondo (RPC → comandos)",
  assets: "Cuadrar saldo de una cuenta (RPC → comandos)",
  loans: "Pagos de deudas y préstamos: N cuotas o un abono (POST /loans/:id/payments) en vez de insertar los pagos",
  importer: "Exportar JSON y crear copias de seguridad del libro",
  bell: "Campana de notificaciones (leer, marcar leídas)",
  notify: "Avisos: reglas, canales, pruebas, resumen ahora, Telegram, cobro por WhatsApp",
  integrations: "Integraciones del hogar (IA): guardar, prender, borrar, probar y modelos",
  google: "Gmail y Google Calendar: conectar, desconectar, sincronizar, estado y leer correos",
  ai: "Asistentes de IA (facturas, clasificar, prima…), resumen del mes y uso de IA",
  chat: "Chat con Mirai (streaming NDJSON), hilos, propuestas y adjuntos",
  households: "Hogar: bienvenida, personas, invitaciones, roles, familia y pasar el hogar",
  account: "Cuenta: correo, métodos de entrada, sesiones y borrar la cuenta",
  billing: "Planes: opciones de pago, cupones, checkout y renovación",
  admin: "Consola de la plataforma (/admin)",
  accountant: "Contador: accesos del titular y portal público por token (el portal solo con \"on\")",
  gami: "Logros y referidos",
  webhooks: "Proxy de /api/pagos/* hacia los webhooks de la API (sin persona: solo \"on\")",
  files: "Archivos: subir (URL firmada + PUT directo) y ver/descargar por la API en vez de Supabase Storage (avatar, opiniones, renta, anuncios, WhatsApp)",
  // V7-H3
  ads: "Anuncios: elegir el de cada espacio, vistas/clics/cierres y AdSense (la consola de anuncios va con `admin`)",
  feedback: "Opiniones y soporte: enviar, calificar, mis opiniones y borrar",
  automations: "Automatizaciones: lista, guardar, borrar/deshacer, probar, plantillas, ejecuciones y el runner (drain)",
  // V7-H2
  books: "Ajustes del libro (book_settings), historial de cambios, conteos de la puesta en marcha y resumen del mes guardado",
  refs: "Datos de referencia de Colombia (UVT, SMMLV, TRM, usura, calendario y regímenes de renta) por /v1/refs/*",
  tax: "Declaración de renta: datos (GET /renta), años, bienes, dependientes, UVT y documentos",
} as const

export type ApiModule = keyof typeof API_MODULES
export const API_MODULE_NAMES = Object.keys(API_MODULES) as ApiModule[]

/** Lo que el servidor de la web le pasa al navegador: origen de la API (vacío = apagada) y módulos encendidos. */
export type ApiConfig = { url: string; flags: Record<string, boolean> }

export const API_OFF: ApiConfig = Object.freeze({ url: "", flags: Object.freeze({}) as Record<string, boolean> })
