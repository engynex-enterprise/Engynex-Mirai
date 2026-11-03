// Cliente del gateway de tiempo real (F2-G-5), sin React ni dependencias en tiempo de ejecución: recibe la función `io`
// de socket.io-client (la web la carga con import() solo si el interruptor está en `gateway`; las pruebas de la API la
// importan directo). Lo usan apps/web/hooks/use-live-gateway.ts y apps/api/test/realtime.
//
// Qué hace:
// - Una conexión por pestaña; varios consumidores (shell, runner de automatizaciones) comparten el libro con un contador.
// - Token fresco en cada (re)conexión (`auth` como función) y `auth:refresh` cuando Supabase lo renueva.
// - Reconexión: si socket.io recupera la sesión (`recovered`), no hay nada que hacer (salas y eventos perdidos vuelven
//   solos); si no, vuelve a entrar a los libros y avisa `resync` para recargar lo del libro (como hooks/use-realtime.ts).
// - Presencia con latido (el servidor la olvida a los 60 s sin latido).
import type { io as ioFn, Socket } from "socket.io-client"
import type { LiveChange } from "./live"
import type { ClientToServerEvents, JoinBookAck, PresenceUpdateInput, PresenceUser, ServerToClientEvents } from "./modules/realtime"

export type LiveStatus = "conectando" | "en-vivo" | "sin-conexion"
export type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type LiveClientOptions = {
  io: typeof ioFn
  /** URL del servicio mirai-realtime (p. ej. https://rt.mirai.engynex.com). */
  url: string
  path?: string
  /** Access token vigente (Supabase: `auth.getSession()`); null = sin sesión. */
  getToken: () => Promise<string | null>
  /** Latido de la presencia (ms). */
  heartbeatMs?: number
  /** Espera antes de reintentar cuando el servidor rechaza o corta (ms, se duplica hasta 60 s). */
  retryMs?: number
  /** Tiempo máximo para el ack de un comando (ms). */
  ackTimeoutMs?: number
  /** Opciones extra para socket.io-client (pruebas: `forceNew`, `transports`…). */
  socketOptions?: Parameters<typeof ioFn>[1]
}

type Events = {
  status: (s: LiveStatus) => void
  change: (c: LiveChange) => void
  presence: (p: { bookId: string; users: PresenceUser[] }) => void
  notification: (n: { id?: string; op: LiveChange["op"] }) => void
  automation: (a: { bookId: string; id?: string }) => void
  /** Hay que recargar lo del libro (reconexión sin recuperación, o la base avisó que se perdieron cambios). */
  resync: (r: { bookId: string; reason: string }) => void
  left: (b: { bookId: string; msg: string }) => void
}

type BookEntry = { refs: number; presence?: PresenceUpdateInput; joined: boolean; ack?: JoinBookAck; /** join() esperando la conexión. */ waiters: ((a: JoinBookAck) => void)[] }

export class LiveGatewayClient {
  private socket?: LiveSocket
  private readonly books = new Map<string, BookEntry>()
  private readonly handlers: { [K in keyof Events]: Set<Events[K]> } = {
    status: new Set(), change: new Set(), presence: new Set(), notification: new Set(), automation: new Set(), resync: new Set(), left: new Set(),
  }
  private state: LiveStatus = "conectando"
  private everConnected = false
  private retry?: ReturnType<typeof setTimeout>
  private heartbeat?: ReturnType<typeof setInterval>
  private retryDelay: number
  private closed = false

  constructor(private readonly o: LiveClientOptions) {
    this.retryDelay = o.retryMs ?? 2_000
  }

  get status(): LiveStatus {
    return this.state
  }
  /** Solo pruebas y diagnóstico. */
  get raw(): LiveSocket | undefined {
    return this.socket
  }

  on<K extends keyof Events>(event: K, fn: Events[K]): () => void {
    this.handlers[event].add(fn)
    return () => this.handlers[event].delete(fn)
  }

  private fire<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    for (const fn of this.handlers[event]) {
      try {
        ;(fn as (...a: Parameters<Events[K]>) => void)(...args)
      } catch {
        /* un consumidor que falla no tumba a los demás */
      }
    }
  }

  private setStatus(s: LiveStatus) {
    if (this.state === s) return
    this.state = s
    this.fire("status", s)
  }

  /** Abre la conexión (idempotente). */
  connect(): this {
    this.closed = false
    if (this.socket) {
      if (!this.socket.connected && !this.socket.active) this.socket.connect()
      return this
    }
    const s: LiveSocket = this.o.io(this.o.url, {
      path: this.o.path ?? "/socket.io",
      transports: ["websocket", "polling"],
      // Función: socket.io la llama en cada intento, así siempre va el token vigente.
      auth: (cb) => {
        this.o.getToken().then((token) => cb({ token: token ?? "" }), () => cb({ token: "" }))
      },
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      ...this.o.socketOptions,
    })
    this.socket = s
    s.on("connect", () => this.onConnect(s))
    s.on("disconnect", (reason) => {
      this.stopHeartbeat()
      for (const b of this.books.values()) b.joined = false
      this.setStatus("sin-conexion")
      // El servidor cortó (token vencido, apagado): socket.io no reintenta solo en este caso.
      if (reason === "io server disconnect") this.scheduleRetry()
    })
    s.on("connect_error", () => {
      this.setStatus("sin-conexion")
      // Rechazo del middleware (sin sesión, origen): `active` queda en false y hay que reintentar a mano.
      if (!s.active) this.scheduleRetry()
    })
    s.on("change", (c) => {
      if (c.bookId && !this.books.has(c.bookId) && !c.householdId) return
      this.fire("change", c)
    })
    s.on("presence", (p) => this.fire("presence", p))
    s.on("notification", (n) => this.fire("notification", n))
    s.on("automation", (a) => this.fire("automation", a))
    s.on("book:left", (b) => {
      const e = this.books.get(b.bookId)
      if (e) e.joined = false
      this.fire("left", b)
    })
    s.on("resync", (r) => {
      for (const bookId of this.books.keys()) this.fire("resync", { bookId, reason: r.reason })
    })
    s.on("auth:expired", () => this.setStatus("sin-conexion"))
    return this
  }

  private onConnect(s: LiveSocket) {
    this.retryDelay = this.o.retryMs ?? 2_000
    const first = !this.everConnected
    this.everConnected = true
    if (s.recovered) {
      // socket.io devolvió las salas y los eventos perdidos: no hay que recargar nada.
      for (const b of this.books.values()) b.joined = true
      this.setStatus("en-vivo")
      this.startHeartbeat()
      // Al desconectarse el servidor quitó su presencia: se vuelve a anunciar ya, sin esperar el latido.
      for (const id of this.books.keys()) this.sendPresence(id)
      return
    }
    const ids = [...this.books.keys()]
    this.setStatus("en-vivo")
    this.startHeartbeat()
    void Promise.all(ids.map((id) => this.sendJoin(id))).then(() => {
      if (this.socket !== s || !s.connected) return
      if (!first) for (const id of ids) this.fire("resync", { bookId: id, reason: "reconexion" })
    })
  }

  private scheduleRetry() {
    if (this.closed || this.retry) return
    const wait = this.retryDelay
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000)
    this.retry = setTimeout(() => {
      this.retry = undefined
      if (!this.closed && this.socket && !this.socket.connected) this.socket.connect()
    }, wait)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      for (const id of this.books.keys()) this.sendPresence(id)
    }, this.o.heartbeatMs ?? 25_000)
  }
  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }

  private async sendJoin(bookId: string): Promise<JoinBookAck> {
    const s = this.socket
    let r: JoinBookAck
    if (!s?.connected) r = { ok: false, code: "INTERNAL", msg: "Sin conexión" }
    else {
      try {
        r = await s.timeout(this.o.ackTimeoutMs ?? 10_000).emitWithAck("join:book", { bookId })
      } catch {
        r = { ok: false, code: "INTERNAL", msg: "El servidor no respondió" }
      }
    }
    const e = this.books.get(bookId)
    if (e && r.ok) {
      Object.assign(e, { joined: true, ack: r })
      this.sendPresence(bookId) // la pantalla actual, si ya la dijeron antes de entrar
    }
    if (e && s?.connected) for (const w of e.waiters.splice(0)) w(r)
    return r
  }

  private sendPresence(bookId: string) {
    const e = this.books.get(bookId)
    if (!e?.presence || !e.joined || !this.socket?.connected) return
    this.socket.timeout(this.o.ackTimeoutMs ?? 10_000).emit("presence:update", e.presence, () => {})
  }

  /**
   * Entra al libro (contador: varios consumidores pueden pedir el mismo). Resuelve con el ack del servidor; si aún no
   * hay conexión, cuando conecte.
   */
  join(bookId: string): Promise<JoinBookAck> {
    let e = this.books.get(bookId)
    if (e) {
      e.refs++
      if (e.joined && e.ack) return Promise.resolve(e.ack)
    } else this.books.set(bookId, (e = { refs: 1, joined: false, waiters: [] }))
    const entry = e
    const p = new Promise<JoinBookAck>((res) => entry.waiters.push(res))
    this.connect()
    if (this.socket?.connected) void this.sendJoin(bookId)
    return p
  }

  /** Suelta el libro; con el último consumidor, sale de la sala. */
  leave(bookId: string) {
    const e = this.books.get(bookId)
    if (!e) return
    if (--e.refs > 0) return
    this.books.delete(bookId)
    if (this.socket?.connected) this.socket.timeout(this.o.ackTimeoutMs ?? 10_000).emit("leave:book", { bookId }, () => {})
  }

  /** En qué pantalla está la persona (se reenvía con el latido y al reconectar). */
  presence(input: PresenceUpdateInput) {
    const e = this.books.get(input.bookId)
    if (!e) return
    e.presence = input
    this.sendPresence(input.bookId)
  }

  /** Token renovado (Supabase TOKEN_REFRESHED). */
  async refreshToken(token: string): Promise<boolean> {
    if (!this.socket?.connected) return false
    try {
      const r = await this.socket.timeout(this.o.ackTimeoutMs ?? 10_000).emitWithAck("auth:refresh", { token })
      return r.ok
    } catch {
      return false
    }
  }

  /** Cierra todo (pruebas o cerrar sesión). */
  close() {
    this.closed = true
    if (this.retry) clearTimeout(this.retry)
    this.retry = undefined
    this.stopHeartbeat()
    this.socket?.disconnect()
    this.socket = undefined
    for (const e of this.books.values()) for (const w of e.waiters.splice(0)) w({ ok: false, code: "INTERNAL", msg: "Conexión cerrada" })
    this.books.clear()
    this.everConnected = false
    this.setStatus("sin-conexion")
  }
}

/**
 * Agrupa ráfagas (importar 100 gastos = una sola recarga por tabla): `add(t)` y, `ms` después del primero, `flush`
 * con todas las tablas juntas. Mismo comportamiento que BURST_MS de hooks/use-realtime.ts.
 */
export function createBurst(ms: number, flush: (tables: Set<string>) => void) {
  const dirty = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    add(t: string) {
      dirty.add(t)
      timer ??= setTimeout(() => {
        timer = undefined
        const copy = new Set(dirty)
        dirty.clear()
        flush(copy)
      }, ms)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = undefined
      dirty.clear()
    },
  }
}
