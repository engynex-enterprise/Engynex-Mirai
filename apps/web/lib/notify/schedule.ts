// Cuándo sale cada envío del cron de avisos (lógica pura, isomórfica; la usan app/api/cron/notify y lib/notify/digest).
//
// Hay dos relojes:
// - Vercel llama una vez al día (`?daily=1`, 11:00 UTC = 6 a. m. en Colombia, vercel.json).
// - pg_cron llama cada hora en el minuto 5 (`select mirai_schedule_notify(url, secreto)`).
// Con el cron horario vivo, la pasada diaria se comporta como la de las 6 a. m. y cada persona recibe su resumen a la hora
// que eligió. Sin él (o si dejó de llegar), la pasada diaria envía a todos, como antes.
// Lo que ya salió no se repite: cada envío reclama su clave en notification_log (dedupe + notify_claim).

/** Horas sin pasadas horarias para dar el cron horario por caído. */
export const LATIDO_HORAS = 3

/** ¿El cron horario está vivo? (interruptor de la consola + última pasada horaria hace menos de LATIDO_HORAS). */
export function horarioActivo(o: { cronHorario?: boolean | null; visto?: string | null; now?: Date }): boolean {
  if (o.cronHorario === false || !o.visto) return false
  const t = new Date(o.visto).getTime()
  return Number.isFinite(t) && (o.now ?? new Date()).getTime() - t < LATIDO_HORAS * 3_600_000
}

/** ¿Toca enviar hoy, a esta hora, el resumen de esta persona? */
export function tocaResumen(o: { frecuencia: string; hora: number; hoy: string; h: number; daily: boolean; horario: boolean }): boolean {
  if (o.frecuencia === "nunca") return false
  if (o.frecuencia === "semanal" && new Date(`${o.hoy}T12:00:00`).getDay() !== 1) return false
  // Sin cron horario, la única pasada (la diaria) envía a todos; con él se espera la hora elegida.
  if (o.daily && !o.horario) return true
  return o.h >= o.hora
}

/**
 * ¿Esta pasada corre una tarea de una vez al día (datos de referencia, Google Calendar, foto del patrimonio a las 6;
 * vencimientos del plan a las 9)? Con el cron horario vivo, solo la pasada horaria de esa hora; sin él, la diaria.
 */
export function tareasDiarias(o: { daily: boolean; horario: boolean; h: number; hora?: number }): boolean {
  const hh = o.hora ?? 6
  return o.horario ? !o.daily && o.h === hh : o.daily || o.h === hh
}

/** Clave de no-duplicado del resumen: una por persona, libro, canal y día. */
export const resumenKey = (userId: string, bookId: string, canal: string, hoy: string) => `resumen:${userId}:${bookId}:${canal}:${hoy}`
