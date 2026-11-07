// Arranque de la API (F2-B-1). OpenTelemetry va primero (instrumenta http/fetch antes de cargar Nest).
import "./otel"
import "reflect-metadata"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { NestFactory } from "@nestjs/core"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { enableZodEs } from "@mirai/contracts/zod-es"
import { AppModule } from "./app.module"
import { configureApp, fastifyAdapter } from "./app.setup"
import { dropBlankEnv } from "./core/config/blank-env"
import { ConfigError, loadConfig } from "./core/config/config.schema"
import { resolveSecretRefs, SecretsError } from "./core/secrets/secrets"
import { createLogger, NestPinoLogger } from "./core/logging/logger"

/** En local (no en Cloud Run) lee la .env.local de la raíz del monorepo, como la web. Nunca pisa lo ya definido. */
function loadLocalEnv() {
  if (process.env.K_SERVICE) return
  for (const f of [".env.local", "../../.env.local"]) {
    const p = resolve(process.cwd(), f)
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p)
      } catch {
        /* archivo ilegible: se sigue con el entorno */
      }
      break
    }
  }
}

async function bootstrap() {
  loadLocalEnv()
  dropBlankEnv() // "" de Compose/Coolify/Terraform = sin definir (antes de cualquier esquema)
  enableZodEs()
  let config
  try {
    // V7-F: con SECRETS_SOURCE=gcp|aws|azure, cambia las referencias secret://… por su valor (por defecto, nada).
    await resolveSecretRefs()
    config = loadConfig()
  } catch (e) {
    // Formato de Cloud Logging aunque el logger aún no exista. Solo nombres de variables, nunca valores.
    const problems = e instanceof ConfigError || e instanceof SecretsError ? e.problems : [String(e)]
    process.stderr.write(JSON.stringify({ severity: "CRITICAL", message: "La API no arrancó: configuración inválida", problems }) + "\n")
    process.exit(1)
  }
  const logger = createLogger({ level: config.logLevel, service: config.mode === "realtime" ? "mirai-realtime" : config.mode === "worker" ? "mirai-worker" : "mirai-api", version: config.version, project: config.gcpProject })
  // V7-F: MODE=worker no monta Nest ni los controladores: consume las colas y despacha a /v1/jobs/** (src/worker).
  if (config.mode === "worker") {
    await (await import("./worker/worker")).runWorker(config, logger)
    return
  }
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register({ config, logger }), fastifyAdapter(config), {
    rawBody: true, // webhooks de pagos: la firma se verifica sobre el cuerpo crudo (req.rawBody)
    logger: new NestPinoLogger(logger),
  })
  configureApp(app, config, logger)
  await app.listen(config.port, config.host)
  logger.info({ port: config.port, mode: config.mode, env: config.env, db: config.db.adapter, commit: config.commit }, "Mirai API lista")
}

bootstrap().catch((e) => {
  process.stderr.write(JSON.stringify({ severity: "CRITICAL", message: "La API no arrancó", error: { message: (e as Error)?.message, stack_trace: (e as Error)?.stack } }) + "\n")
  process.exit(1)
})
