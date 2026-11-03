// Puertos de los trabajos programados (§2.1). Los adaptadores usan @mirai/services (el mismo código del cron de la
// web, apps/web/app/api/cron/notify) con SystemScope. Las pruebas los cambian por dobles: sin base ni envíos reales.
import type { Heartbeat } from "@mirai/services/notify/cron"

export abstract class NotifyJobs {
  /** ¿Hay base? Sin SUPABASE_SECRET_KEY (solo en local) los trabajos no pueden leerla y el tick lo dice en `nota`. */
  abstract readonly ready: boolean
  /** Latido del cron horario (no escribe en simulación) y si el cron horario está vivo. */
  abstract heartbeat(o: { now: Date; dry: boolean }): Promise<Heartbeat>
  /** Hogares con al menos un libro vivo. */
  abstract households(): Promise<string[]>
  /** Resúmenes de un hogar: el mismo reporte `runs` del cron de la web. */
  abstract household(householdId: string, o: { now: Date; horario: boolean; dry: boolean }): Promise<Record<string, string[]>>
  /** Correos de los avisos del plan (en simulación: cuántos se revisarían). */
  abstract planEmails(now: Date, dry: boolean): Promise<number>
  /** TRM, usura, festivos y precios (líneas del reporte, como `report.refs`). */
  abstract refs(): Promise<string[]>
  abstract calendarUsers(): Promise<string[]>
  abstract calendarUser(userId: string, dry: boolean): Promise<string[]>
  /** Foto del patrimonio del mes (el día 1). */
  abstract netWorth(now: Date): Promise<number>
}

/**
 * Vencimientos de Premium (lib/payments/reminders.ts de la web). Es de facturación (F2-I): su BillingModule debe
 * proveer este puerto. Mientras tanto el adaptador por defecto no hace nada y lo dice en el reporte (la web sigue
 * corriendo los recordatorios en su cron).
 */
export abstract class PlanRemindersPort {
  abstract run(now: Date, dry: boolean): Promise<number | string>
}
