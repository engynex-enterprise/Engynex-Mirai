// Adaptador de socket.io para Nest (F2-G-1): opciones del servidor desde la configuración (ruta, CORS con WEB_ORIGINS,
// recuperación de la conexión, latidos y tamaño máximo) y, con REDIS_URL, el adaptador de Redis para varias instancias.
// Se instala en app.setup.ts solo con MODE=realtime (configureRealtime).
import type { INestApplicationContext } from "@nestjs/common"
import { IoAdapter } from "@nestjs/platform-socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import type { Server, ServerOptions } from "socket.io"
import { originAllowed } from "../../app.setup"
import { RealtimeConfig } from "./realtime.config"
import { RedisClients } from "./redis"

/** Opciones de socket.io (exportado para las pruebas). */
export function ioOptions(cfg: RealtimeConfig, redis: boolean): Partial<ServerOptions> {
  return {
    path: cfg.path,
    serveClient: false,
    transports: ["websocket", "polling"],
    // Bearer en `auth` (Supabase) o, v7, la cookie de Better Auth: con credenciales solo para los orígenes de la web
    // (el mismo filtro de allowRequest; un sitio ajeno nunca recibe Access-Control-Allow-Credentials).
    cors: { origin: (origin, cb) => cb(null, originAllowed(origin, cfg.webOrigins)), credentials: true, methods: ["GET", "POST"] },
    // Cloud Run corta el WS a los 60 min: el cliente vuelve y recupera salas y eventos perdidos. El adaptador de Redis
    // por pub/sub no guarda sesiones (solo el de streams), así que con Redis el cliente recarga el libro al volver.
    ...(cfg.recoveryMs > 0 && !redis ? { connectionStateRecovery: { maxDisconnectionDuration: cfg.recoveryMs, skipMiddlewares: false } } : {}),
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
    // Comprueba el origen también en el WebSocket (los navegadores no aplican CORS al upgrade).
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin, cfg.webOrigins)),
  }
}

export class MiraiIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app)
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const cfg = this.app.get(RealtimeConfig)
    const redis = this.app.get(RedisClients)
    const server = super.createIOServer(port, { ...options, ...ioOptions(cfg, redis.enabled) }) as Server
    if (redis.enabled) server.adapter(createAdapter(redis.pub, redis.sub, { key: "mirai-rt" }))
    return server
  }
}
