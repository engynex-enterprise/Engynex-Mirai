// Puerto del motor de automatizaciones en el servidor (§2.1). El adaptador usa @mirai/services/automations/server (el
// mismo processBook / runAutomationsCron de la web): reclamo atómico de automation_events y candado por ejecución en
// automation_runs, así la API, el cron de la web y el runner del navegador pueden convivir sin duplicar.
export abstract class AutomationsRunner {
  /** Procesa la cola de un libro y sus disparadores por estado (lo que hace el runner del navegador). */
  abstract processBook(bookId: string): Promise<string[]>
  /** Pasada de la hora: cola, estados, programadas, esperas cumplidas y limpieza (runAutomationsCron). */
  abstract hourly(): Promise<unknown>
  /** Libros con eventos sin procesar (para el *drain*). */
  abstract pendingBooks(): Promise<string[]>
}
