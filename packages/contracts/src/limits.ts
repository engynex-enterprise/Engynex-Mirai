// Límites de tasa de Mirai: intentos por ventana (segundos). Una sola tabla para ajustarlos.
// Los aplica apps/web/lib/security/rate-limit.ts (función SQL rate_limit_hit) y, en la fase 2, el ThrottlerStorage de la API.

export const LIMITS = {
  chat: { max: 60, windowS: 600 },             // mensajes al chat por persona cada 10 minutos
  chatAdjunto: { max: 15, windowS: 3600 },     // fotos o PDF al chat por persona por hora
  ia: { max: 120, windowS: 3600 },             // llamadas a la IA por hogar por hora (si no hay Upstash)
  invitar: { max: 15, windowS: 86400 },        // invitaciones nuevas por persona al día
  invitarMin: { max: 5, windowS: 300 },        // y no más de 5 en 5 minutos
  pruebaAviso: { max: 6, windowS: 900 },       // "Enviarme una prueba" / "Enviar resumen ahora" cada 15 minutos
  cobroWa: { max: 10, windowS: 86400 },        // recordatorios de cobro por WhatsApp (número de Mirai) por persona al día
  contador: { max: 10, windowS: 86400 },       // accesos nuevos para el contador al día
  portalContador: { max: 120, windowS: 600 },  // aperturas del portal por enlace cada 10 minutos
  cuentaCorreo: { max: 5, windowS: 3600 },     // pedir, reenviar o cancelar un cambio de correo por hora
  cuentaMetodo: { max: 10, windowS: 3600 },    // quitar formas de entrar o cerrar sesiones por hora
  pasarHogar: { max: 12, windowS: 3600 },      // pedir, responder o cancelar pasar el hogar por hora
  borrarHogar: { max: 3, windowS: 3600 },      // borrar o salir de hogares por hora
  automatizaciones: { max: 60, windowS: 600 }, // probar o procesar ya las automatizaciones de un libro cada 10 minutos (por persona)
  subidas: { max: 60, windowS: 600 },          // URL firmadas para subir archivos por persona cada 10 minutos
  opiniones: { max: 10, windowS: 3600 },       // opiniones, casos de soporte o calificaciones por persona por hora
} as const
export type LimitName = keyof typeof LIMITS
