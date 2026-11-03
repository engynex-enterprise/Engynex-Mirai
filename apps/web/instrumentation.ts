// Sentry en el servidor: solo si existe NEXT_PUBLIC_SENTRY_DSN (Ajustes › Integraciones › Sentry).
import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1, environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV })
}

export const onRequestError = Sentry.captureRequestError
