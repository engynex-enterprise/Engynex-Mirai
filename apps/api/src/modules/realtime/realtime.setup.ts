// Instala el adaptador de socket.io (opciones + Redis) antes de app.init(). Lo llama configureApp con MODE=realtime.
import type { INestApplication } from "@nestjs/common"
import { MiraiIoAdapter } from "./io.adapter"

export function configureRealtime(app: INestApplication) {
  app.useWebSocketAdapter(new MiraiIoAdapter(app))
}
