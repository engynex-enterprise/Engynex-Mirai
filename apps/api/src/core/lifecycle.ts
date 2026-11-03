import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common"
import type { Logger } from "pino"
import { shutdownTelemetry } from "../otel"
import { LOGGER } from "./logging/logger"

/** Apagado ordenado (Cloud Run manda SIGTERM y da 10 s): Fastify deja de aceptar y termina lo que está en curso. */
@Injectable()
export class Lifecycle implements OnApplicationShutdown {
  constructor(@Inject(LOGGER) private readonly log: Logger) {}
  async onApplicationShutdown(signal?: string) {
    this.log.info({ signal }, "Apagando la API")
    await shutdownTelemetry()
  }
}
