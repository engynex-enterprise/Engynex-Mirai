// Puerto de Google (§2.1): OAuth, tokens cifrados en google_connections y Google Calendar. El adaptador usa
// @mirai/services/google (el mismo código de la web).
import type { CalSync } from "@mirai/services/google/calendar"

export abstract class GooglePort {
  /** ¿El despliegue tiene GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET? */
  abstract configured(): boolean
  abstract clientId(): string
  /** ¿Mirai ofrece el servicio a este hogar? (consola › Integraciones globales). */
  abstract available(householdId: string, s: "gmail" | "calendar"): Promise<boolean>
  /** Cambia el código por tokens y los guarda cifrados para la persona (con el correo de su cuenta de Google). */
  abstract connect(userId: string, code: string, redirectUri: string): Promise<void>
  abstract disconnect(userId: string): Promise<void>
  /** Correo y permisos de la conexión de la persona (null si no conectó). Nunca los tokens. */
  abstract connection(userId: string): Promise<{ email: string | null; scopes: string[] } | null>
  abstract syncCalendar(o: { userId: string; bookId: string; householdId: string }): Promise<CalSync>
  abstract calendarStatus(userId: string, bookId: string): Promise<{ conectado: boolean; eventos: number }>
}
