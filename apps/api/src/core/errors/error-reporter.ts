// Puerto para reportar errores inesperados (Sentry, Error Reporting). Hoy solo escribe en el log (Cloud Logging los
// agrupa en Error Reporting por el `stack_trace`/`@type`). Pendiente: adaptador @sentry/nestjs (ver README).
export abstract class ErrorReporter {
  abstract report(error: unknown, ctx: { requestId?: string; route?: string; userId?: string }): void
}

export class NoopErrorReporter extends ErrorReporter {
  report() {}
}
