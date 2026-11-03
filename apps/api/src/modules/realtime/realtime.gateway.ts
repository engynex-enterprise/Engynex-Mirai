// Gateway socket.io (F2-G-1/G-3), servicio `mirai-realtime` (MODE=realtime).
// - Autenticación en el handshake con el MISMO TokenVerifier de la API (`auth: { token }` o `Authorization: Bearer`).
// - `join:book` comprueba la membresía con AppContextService.bookAccess (la misma consulta de BookGuard, con su caché
//   de 30 s) y une a las salas del libro, del libro por rol y del hogar. La sala de la persona va desde la conexión.
// - Revisión periódica: token vencido → `auth:expired` + desconexión; ya no es miembro → `book:left`.
//   Si cambia household_members (trigger), se revisa al instante en todas las instancias (serverSideEmit).
// - Presencia con vencimiento y latido (PresenceStore en memoria o en Redis).
// Los handlers nunca lanzan: responden con el ack `{ ok:false, code, msg }` (mensajes en español).
import { Inject, type OnModuleDestroy } from "@nestjs/common"
import { ConnectedSocket, MessageBody, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets"
import type { Logger } from "pino"
import type { Server, Socket } from "socket.io"
import type { z } from "zod"
import { can, type AccessRole } from "@mirai/domain/household/roles"
import {
  AuthRefreshInput, JoinBookInput, PresenceUpdateInput, RT_MSG, rooms,
  type Ack, type ClientToServerEvents, type JoinBookAck, type PresenceUser, type ServerToClientEvents,
} from "@mirai/contracts/modules/realtime"
import { bearer } from "../../core/auth/auth.guard"
import { TokenVerifier, type AuthUser } from "../../core/auth/token-verifier"
import { AppContextService } from "../../core/context/app-context.service"
import { DomainError, INTERNAL_MSG } from "../../core/errors/domain-error"
import { EventsService } from "../../core/events/events.service"
import { LOGGER } from "../../core/logging/logger"
import { LiveFanout, type LiveSink } from "./live-fanout"
import { PresenceStore } from "./presence.store"
import { RealtimeConfig } from "./realtime.config"

type BookJoin = { householdId: string; role: AccessRole }
export type SocketData = {
  user: AuthUser
  /** Vencimiento del token (ms). */
  exp: number
  books: Record<string, BookJoin>
  bucket: { at: number; n: number }
}
export interface InterServerEvents {
  revalidate: (householdId: string) => void
}
export type RtServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
export type RtSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

type ErrCode = Extract<Ack, { ok: false }>["code"]
const fail = (code: ErrCode, msg: string) => ({ ok: false as const, code, msg })

/** Error del middleware: el cliente lo recibe en `connect_error` (err.message y err.data). */
function wsError(code: ErrCode, msg: string) {
  const e = new Error(msg) as Error & { data: { code: ErrCode; msg: string } }
  e.data = { code, msg }
  return e
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos"

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server!: RtServer
  private sweepTimer?: ReturnType<typeof setInterval>
  private offEvents?: () => void

  constructor(
    private readonly cfg: RealtimeConfig,
    private readonly verifier: TokenVerifier,
    private readonly contexts: AppContextService,
    private readonly presence: PresenceStore,
    private readonly fanout: LiveFanout,
    private readonly events: EventsService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  afterInit(server: RtServer) {
    server.use((socket, next) => {
      void this.authenticate(socket as RtSocket).then(next, next)
    })
    const sink: LiveSink = {
      deliver: (d) => server.to(d.rooms).emit(d.event, d.payload as never),
      revalidateHousehold: (h) => {
        server.serverSideEmit("revalidate", h)
        void this.revalidateHousehold(h)
      },
      resyncAll: (reason) => server.emit("resync", { reason }),
    }
    this.fanout.attach(sink)
    server.on("revalidate", (h: string) => void this.revalidateHousehold(h))
    // Escrituras hechas en este mismo proceso (la API corre en otro servicio y publica por Redis: realtime-publisher).
    this.offEvents = this.events.subscribe((c) => this.fanout.fromChange(c))
    this.sweepTimer = setInterval(() => void this.sweep(), this.cfg.tokenCheckMs)
    this.sweepTimer.unref?.()
    this.log.info({ path: this.cfg.path, redis: !!this.cfg.redisUrl, pgListen: this.cfg.pgListen }, "Gateway de tiempo real listo")
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    this.offEvents?.()
  }

  /** Middleware del handshake. Resuelve con un error para rechazar (connect_error en el cliente). */
  private async authenticate(socket: RtSocket): Promise<Error | undefined> {
    const h = socket.handshake
    const raw = typeof h.auth?.token === "string" && h.auth.token ? h.auth.token : bearer(h.headers.authorization)
    if (!raw) return wsError("UNAUTHENTICATED", RT_MSG.login)
    try {
      const user = await this.verifier.verify(raw)
      const prev = socket.data?.user?.id
      socket.data.user = user
      socket.data.exp = Number(user.claims.exp) * 1000
      socket.data.bucket = { at: Date.now(), n: 0 }
      // Sesión recuperada de otra persona (mismo navegador, otra cuenta): no hereda libros.
      if (!socket.data.books || (prev && prev !== user.id)) socket.data.books = {}
      return undefined
    } catch (e) {
      if (e instanceof DomainError && e.code === "UNAUTHENTICATED") return wsError("UNAUTHENTICATED", e.msg)
      this.log.warn({ error: e }, "no se pudo validar el token del WebSocket")
      return wsError("INTERNAL", e instanceof DomainError ? e.msg : INTERNAL_MSG)
    }
  }

  handleConnection(socket: RtSocket) {
    const { user, books } = socket.data
    const keep = new Set([socket.id, rooms.user(user.id)])
    for (const [b, j] of Object.entries(books)) keep.add(rooms.book(b)).add(rooms.bookRole(b, j.role)).add(rooms.household(j.householdId))
    for (const r of socket.rooms) if (!keep.has(r)) void socket.leave(r)
    void socket.join(rooms.user(user.id))
    this.log.debug({ userId: user.id, recovered: socket.recovered, transport: socket.conn.transport.name }, "conexión en vivo")
  }

  async handleDisconnect(socket: RtSocket) {
    const books = Object.keys(socket.data?.books ?? {})
    for (const b of books) await this.dropPresence(b, socket.id)
  }

  /** Límite de comandos por conexión (ventana de 10 s). */
  private limited(socket: RtSocket): boolean {
    const now = Date.now()
    const b = (socket.data.bucket ??= { at: now, n: 0 })
    if (now - b.at > 10_000) Object.assign(b, { at: now, n: 0 })
    return ++b.n > this.cfg.eventsPer10s
  }

  @SubscribeMessage("join:book")
  async joinBook(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<JoinBookAck> {
    if (this.limited(socket)) return fail("RATE_LIMITED", RT_MSG.rate)
    const p = JoinBookInput.safeParse(body)
    if (!p.success) return fail("VALIDATION", firstIssue(p.error))
    const { bookId } = p.data
    const books = socket.data.books
    if (!books[bookId] && Object.keys(books).length >= this.cfg.maxBooks) return fail("VALIDATION", RT_MSG.tooManyBooks)
    let access
    try {
      access = await this.contexts.bookAccess(socket.data.user, bookId)
    } catch (e) {
      if (e instanceof DomainError && e.code === "UNAUTHENTICATED") return fail("UNAUTHENTICATED", e.msg)
      this.log.warn({ error: e, bookId }, "join:book falló")
      return fail("INTERNAL", INTERNAL_MSG)
    }
    if (!access) return fail("NOT_FOUND", RT_MSG.notMember)
    if (!can(access.access, "ver")) return fail("ROLE_DENIED", RT_MSG.left)
    const prev = books[bookId]
    if (prev && prev.role !== access.access) await socket.leave(rooms.bookRole(bookId, prev.role))
    books[bookId] = { householdId: access.household.id, role: access.access }
    await socket.join([rooms.book(bookId), rooms.bookRole(bookId, access.access), rooms.household(access.household.id)])
    socket.emit("presence", { bookId, users: await this.safeList(bookId) })
    return { ok: true, bookId, householdId: access.household.id, role: access.access }
  }

  @SubscribeMessage("leave:book")
  async leaveBook(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<Ack> {
    if (this.limited(socket)) return fail("RATE_LIMITED", RT_MSG.rate)
    const p = JoinBookInput.safeParse(body)
    if (!p.success) return fail("VALIDATION", firstIssue(p.error))
    await this.removeBook(socket, p.data.bookId)
    return { ok: true }
  }

  @SubscribeMessage("presence:update")
  async presenceUpdate(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<Ack> {
    if (this.limited(socket)) return fail("RATE_LIMITED", RT_MSG.rate)
    const p = PresenceUpdateInput.safeParse(body)
    if (!p.success) return fail("VALIDATION", firstIssue(p.error))
    const { bookId, path, nombre, avatar } = p.data
    if (!socket.data.books[bookId]) return fail("ROLE_DENIED", RT_MSG.notJoined)
    // El id sale del token: nadie puede aparecer como otra persona.
    const user: PresenceUser = { id: socket.data.user.id, nombre, avatar, path, at: new Date().toISOString() }
    try {
      await this.presence.set(bookId, socket.id, user, this.cfg.presenceTtlMs)
      // También en cada latido: así desaparece quien venció (pestaña o instancia caída). Un hogar son pocas personas.
      await this.broadcastPresence(bookId)
      return { ok: true }
    } catch (e) {
      this.log.warn({ error: e }, "presencia falló")
      return fail("INTERNAL", INTERNAL_MSG)
    }
  }

  @SubscribeMessage("auth:refresh")
  async authRefresh(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<Ack<{ expiresAt: number }>> {
    if (this.limited(socket)) return fail("RATE_LIMITED", RT_MSG.rate)
    const p = AuthRefreshInput.safeParse(body)
    if (!p.success) return fail("VALIDATION", firstIssue(p.error))
    try {
      const user = await this.verifier.verify(p.data.token)
      if (user.id !== socket.data.user.id) return fail("UNAUTHENTICATED", RT_MSG.login)
      socket.data.user = user
      socket.data.exp = Number(user.claims.exp) * 1000
      return { ok: true, expiresAt: socket.data.exp }
    } catch (e) {
      return fail("UNAUTHENTICATED", e instanceof DomainError ? e.msg : RT_MSG.login)
    }
  }

  // ── Revisión de tokens y membresías ─────────────────────────────────────────────────────────────────────────
  /** Conexiones de esta instancia. */
  private localSockets(): RtSocket[] {
    return [...this.server.sockets.sockets.values()] as RtSocket[]
  }

  /** Revisión periódica (REALTIME_TOKEN_CHECK_S). Exportada para las pruebas. */
  async sweep(now = Date.now()) {
    const seen = new Set<string>()
    for (const s of this.localSockets()) {
      if (!s.data?.user) continue
      if (s.data.exp <= now) {
        s.emit("auth:expired", { msg: RT_MSG.expired })
        s.disconnect(true)
        continue
      }
      if (!seen.has(s.data.user.id)) {
        seen.add(s.data.user.id)
        this.contexts.invalidate(s.data.user.id)
      }
      for (const bookId of Object.keys(s.data.books)) await this.recheck(s, bookId)
    }
  }

  /** Cambió household_members de ese hogar: revisa ya a quienes estén en su sala (en esta instancia). */
  async revalidateHousehold(householdId: string) {
    const room = rooms.household(householdId)
    const targets = this.localSockets().filter((s) => s.rooms.has(room) && s.data?.user)
    for (const uid of new Set(targets.map((s) => s.data.user.id))) this.contexts.invalidate(uid)
    for (const s of targets) for (const [bookId, j] of Object.entries(s.data.books)) if (j.householdId === householdId) await this.recheck(s, bookId)
  }

  private async recheck(s: RtSocket, bookId: string) {
    let access
    try {
      access = await this.contexts.bookAccess(s.data.user, bookId)
    } catch (e) {
      // Falla transitoria (red, base): no se saca a nadie por eso.
      this.log.debug({ error: e }, "no se pudo revisar la membresía")
      return
    }
    const j = s.data.books[bookId]
    if (!j) return
    if (!access || !can(access.access, "ver")) {
      await this.removeBook(s, bookId)
      s.emit("book:left", { bookId, msg: RT_MSG.left })
      return
    }
    if (access.access !== j.role) {
      await s.leave(rooms.bookRole(bookId, j.role))
      await s.join(rooms.bookRole(bookId, access.access))
      j.role = access.access
    }
  }

  private async removeBook(s: RtSocket, bookId: string) {
    const j = s.data.books[bookId]
    if (!j) return
    delete s.data.books[bookId]
    await s.leave(rooms.book(bookId))
    await s.leave(rooms.bookRole(bookId, j.role))
    if (!Object.values(s.data.books).some((x) => x.householdId === j.householdId)) await s.leave(rooms.household(j.householdId))
    await this.dropPresence(bookId, s.id)
  }

  // ── Presencia ───────────────────────────────────────────────────────────────────────────────────────────────
  private async safeList(bookId: string): Promise<PresenceUser[]> {
    try {
      return await this.presence.list(bookId)
    } catch {
      return []
    }
  }

  private async broadcastPresence(bookId: string) {
    this.server.to(rooms.book(bookId)).emit("presence", { bookId, users: await this.safeList(bookId) })
  }

  private async dropPresence(bookId: string, socketId: string) {
    try {
      await this.presence.remove(bookId, socketId)
      await this.broadcastPresence(bookId)
    } catch (e) {
      this.log.debug({ error: e }, "no se pudo quitar la presencia")
    }
  }
}
