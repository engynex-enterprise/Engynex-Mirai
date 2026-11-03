// Dobles de los puertos de F2-C (lecturas) y app de prueba con ellos. Sin red ni base: guardan con qué alcance los
// llamaron y responden con el libro de ejemplo (sample-book.ts). La "RLS" de los dobles: solo hay datos de B_GRATIS y
// B_PREMIUM; BookGuard ya devuelve 404 a quien no es miembro antes de llegar aquí.
import type { DynamicModule, Type } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import type { Ad } from "@mirai/contracts/modules/ads"
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import type { AnioValor, Festivo, RentaFecha, RentaRegimen, Trm, Usura } from "@mirai/contracts/modules/refs"
import type { NotificationRow } from "@mirai/contracts/modules/notifications-bell"
import type { BookPart, BookParts, PartRows } from "@mirai/domain/book-data"
import { GBADGES } from "@mirai/domain/gami"
import type { ExtrasRows } from "@mirai/domain/integral-extras"
import type { SnapshotIn } from "@mirai/domain/vistas"
import { AppModule } from "../../src/app.module"
import { configureApp, fastifyAdapter } from "../../src/app.setup"
import { JoseOidcVerifier, OidcVerifier } from "../../src/core/auth/scheduler.guard"
import { staticJwks } from "../../src/core/auth/jwks"
import { JoseTokenVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../../src/core/auth/token-verifier"
import { loadConfig } from "../../src/core/config/config.schema"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import { DbHealth } from "../../src/core/db/db-health"
import type { DbScope, SystemScope } from "../../src/core/db/scope"
import { createLogger } from "../../src/core/logging/logger"
import { AdsRepo, type AdsData } from "../../src/modules/ads/ads.repository"
import { BookTablesRepo, type ListRows } from "../../src/modules/book-tables/book-tables.repository"
import { GamiRepo, type GamiState, type ReferidosRows } from "../../src/modules/gami/gami.repository"
import { InsightsRepo, type BookRef, type RentaCalcRows } from "../../src/modules/insights/insights.repository"
import { RefsRepo, type FestivosQ, type RentaCalendarQ } from "../../src/modules/insights/refs/refs.repository"
import { BellRepo, type BellList } from "../../src/modules/notifications/bell/bell.repository"
import { FakeAppContextRepo } from "./fakes"
import { B_GRATIS, B_PREMIUM, USERS } from "./fixtures"
import { sampleExtras, sampleParts, sampleRenta } from "./sample-book"
import { AUDIENCE, ISSUER, signers } from "./tokens"
import { CRON_SECRET, SCHEDULER_SA, TEST_KEY } from "./app"

type Call = { scope: DbScope; m: string; q?: unknown }

export class FakeBookTablesRepo extends BookTablesRepo {
  calls: Call[] = []
  books = new Map<string, BookParts>([[B_GRATIS, sampleParts(B_GRATIS)], [B_PREMIUM, sampleParts(B_PREMIUM)]])
  /** Filas sueltas por tabla (para la lista genérica), además de las partes. */
  extra: Record<string, BookRow[]> = {}

  async list(scope: DbScope, q: ListRows): Promise<BookRow[]> {
    this.calls.push({ scope, m: "list", q })
    const base = (this.extra[q.table] ?? ((this.books.get(q.bookId) as Record<string, BookRow[]> | undefined)?.[q.table] ?? [])) as BookRow[]
    let rows = base.filter((r) => (r.book_id ?? q.bookId) === q.bookId && !r.deleted_at)
    for (const [k, v] of q.eq) rows = rows.filter((r) => (v === null ? r[k] == null : String(r[k]) === v))
    if (q.order) {
      const { column, ascending } = q.order
      rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
    }
    return q.select === "*" ? rows : rows.map((r) => Object.fromEntries((q.select as string[]).map((c) => [c, r[c]])))
  }

  async part(scope: DbScope, bookId: string, part: BookPart): Promise<PartRows> {
    this.calls.push({ scope, m: "part", q: { bookId, part } })
    return (this.books.get(bookId)?.[part] ?? []) as PartRows
  }
}

export class FakeInsightsRepo extends InsightsRepo {
  calls: Call[] = []
  rows = sampleExtras()
  rentaRows: RentaCalcRows | Error = sampleRenta()
  snaps: SnapshotIn[] = [{ mes: "2026-08", patrimonio: "61000000" }, { mes: "2026-09", patrimonio: 63500000 }]

  async extras(scope: DbScope, q: BookRef): Promise<Omit<ExtrasRows, "renta">> {
    this.calls.push({ scope, m: "extras", q })
    return this.rows
  }
  async renta(scope: DbScope, q: BookRef): Promise<RentaCalcRows> {
    this.calls.push({ scope, m: "renta", q })
    if (this.rentaRows instanceof Error) throw this.rentaRows
    return this.rentaRows
  }
  async snapshots(scope: DbScope, bookId: string): Promise<SnapshotIn[]> {
    this.calls.push({ scope, m: "snapshots", q: bookId })
    return this.snaps
  }
}

export class FakeRefsRepo extends RefsRepo {
  calls: Call[] = []
  async porAnio(scope: DbScope, tabla: "ref_uvt" | "ref_smmlv"): Promise<AnioValor[]> {
    this.calls.push({ scope, m: tabla })
    return [{ year: 2026, valor: 1, fuente: `prueba ${tabla}` }]
  }
  async trm(scope: DbScope, limit: number): Promise<Trm[]> {
    this.calls.push({ scope, m: "trm", q: limit })
    return [{ fecha: "2026-11-02", valor: 2, fuente: "prueba" }, { fecha: "2026-11-01", valor: 3, fuente: null }].slice(0, limit)
  }
  async usura(scope: DbScope, limit: number): Promise<Usura[]> {
    this.calls.push({ scope, m: "usura", q: limit })
    return [{ desde: "2026-11-01", hasta: "2026-11-30", modalidad: "consumo", tasa_ea: 4 }].slice(0, limit)
  }
  async festivos(scope: DbScope, q: FestivosQ): Promise<Festivo[]> {
    this.calls.push({ scope, m: "festivos", q })
    return [{ fecha: "2026-11-02", nombre: "Festivo de prueba" }]
  }
  async rentaCalendar(scope: DbScope, q: RentaCalendarQ): Promise<RentaFecha[]> {
    this.calls.push({ scope, m: "rentaCalendar", q })
    return [{ year: 2026, digitos: q.digitos ?? "00", regimen: "general", fecha: "2026-08-12" }]
  }
  async rentaRegimenes(scope: DbScope): Promise<RentaRegimen[]> {
    this.calls.push({ scope, m: "rentaRegimenes" })
    return [{ key: "general", nombre: "General", descripcion: "", norma: "", seccionales: [] }]
  }
}

export class FakeGamiRepo extends GamiRepo {
  calls: Call[] = []
  st: GamiState = {
    on: true, visitas: ["2026-10-31", "2026-10-30", "2026-10-29", "2026-10-20"], unl: { [GBADGES[0].id]: "2026-10-01T00:00:00Z" },
    mis: {}, maxLevel: 1, init: "2026-10-01", chats: 2, consejos: 1, retos: [], fondo: { on: true, saldo: 1_500_000 }, nombre: "Alberto Navarro",
  }
  codes = new Map<string, string>()
  /** Cuántas veces seguidas el código nuevo choca con uno existente (23505). */
  colisiones = 0
  async state(scope: DbScope, q: { bookId: string; userId: string }): Promise<GamiState> {
    this.calls.push({ scope, m: "state", q })
    return this.st
  }
  async referidos(scope: SystemScope, userId: string): Promise<ReferidosRows> {
    this.calls.push({ scope, m: "referidos", q: userId })
    return {
      codigo: this.codes.get(userId) ?? null,
      invitados: [{ id: "r1", referred: USERS.viewer, estado: "premiado", created_at: "2026-10-01T00:00:00Z" }, { id: "r2", referred: "sin-perfil", estado: "pendiente", created_at: "2026-09-01T00:00:00Z" }],
      nombres: { [USERS.viewer]: "Laura Gómez" },
      cfg: { referidos_activo: true, referidos_plan: "premium", referidos_dias: 15 },
      plan: "Premium",
    }
  }
  async crearCodigo(scope: SystemScope, userId: string, codigo: string): Promise<boolean> {
    this.calls.push({ scope, m: "crearCodigo", q: codigo })
    if (this.colisiones > 0) {
      this.colisiones--
      return false
    }
    this.codes.set(userId, codigo)
    return true
  }
}

const ad = (o: Partial<Ad>): Ad => ({ id: "ad", titulo: "T", texto: "", imagen: null, url: "https://x.co", cta: "Ver", anunciante: "A", ubicaciones: ["inicio"], activo: true, desde: null, hasta: null, prioridad: 0, campaign_id: null, formato: "imagen", media: {}, ...o })

export class FakeAdsRepo extends AdsRepo {
  calls: Call[] = []
  data: AdsData = {
    ads: [
      ad({ id: "a-gratis", campaign_id: "c-gratis", prioridad: 1 }),
      ad({ id: "a-premium", campaign_id: "c-premium", prioridad: 5 }),
      ad({ id: "a-agotado", prioridad: 9 }),
      ad({ id: "a-vencido", prioridad: 9, hasta: "2026-01-01" }),
      ad({ id: "a-lista", ubicaciones: ["lista"] }),
    ],
    campaigns: [
      { id: "c-gratis", estado: "activa", desde: null, hasta: null, planes: ["gratis"], dispositivos: [], frecuencia_max: 5, prioridad: 0 },
      { id: "c-premium", estado: "activa", desde: null, hasta: null, planes: ["premium"], dispositivos: ["movil"], frecuencia_max: 5, prioridad: 0 },
    ],
    vistas: { "a-agotado": 5 },
    settings: { anuncios_adsense_pct: 0, anuncios_accion_cada: 3, anuncios_modal_horas: 24, anuncios_ticker: true },
  }
  async load(scope: DbScope, q: { userId: string; hoy: string }): Promise<AdsData> {
    this.calls.push({ scope, m: "load", q })
    return this.data
  }
}

const notif = (o: Partial<NotificationRow>): NotificationRow => ({ id: "n", user_id: USERS.viewer, book_id: null, kind: "sistema", titulo: "Hola", cuerpo: "", href: null, dedupe: null, read_at: null, created_at: "2026-11-01T00:00:00Z", ...o })

export class FakeBellRepo extends BellRepo {
  calls: Call[] = []
  rows: NotificationRow[] = []
  reset() {
    this.rows = [
      notif({ id: "00000000-0000-4000-8000-00000000a001", book_id: B_GRATIS, created_at: "2026-11-02T00:00:00Z" }),
      notif({ id: "00000000-0000-4000-8000-00000000a002", book_id: null }),
      notif({ id: "00000000-0000-4000-8000-00000000a003", book_id: B_PREMIUM, read_at: "2026-11-01T00:00:00Z" }),
      notif({ id: "00000000-0000-4000-8000-00000000a004", user_id: USERS.owner }),
    ]
  }
  async list(scope: DbScope, q: BellList): Promise<NotificationRow[]> {
    this.calls.push({ scope, m: "list", q })
    return this.rows
      .filter((r) => r.user_id === q.userId && (!q.bookId || r.book_id === q.bookId || r.book_id === null) && (!q.sinLeer || !r.read_at))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, q.limit)
  }
  async markRead(scope: DbScope, q: { userId: string; id: string; at: string }) {
    this.calls.push({ scope, m: "markRead", q })
    const r = this.rows.find((x) => x.id === q.id && x.user_id === q.userId)
    if (!r) return null
    r.read_at = q.at
    return { id: r.id, read_at: q.at }
  }
  async markAll(scope: DbScope, q: { userId: string; at: string }) {
    this.calls.push({ scope, m: "markAll", q })
    const mine = this.rows.filter((x) => x.user_id === q.userId && !x.read_at)
    for (const r of mine) r.read_at = q.at
    return mine.length
  }
}

export type ReadApp = {
  app: NestFastifyApplication
  tables: FakeBookTablesRepo
  insights: FakeInsightsRepo
  refs: FakeRefsRepo
  gami: FakeGamiRepo
  ads: FakeAdsRepo
  bell: FakeBellRepo
  close(): Promise<void>
}

/** La app real (AppModule + configureApp) con los puertos de F2-C reemplazados por dobles (como createTestApp). */
export async function createReadApp(o: { modules?: (Type | DynamicModule)[] } = {}): Promise<ReadApp> {
  const config = loadConfig({
    MIRAI_ENV: "local", SUPABASE_URL: "https://proyecto-prueba.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: TEST_KEY, CRON_SECRET, SCHEDULER_AUDIENCE: "https://api-pruebas.mirai.test", SCHEDULER_SERVICE_ACCOUNTS: SCHEDULER_SA,
    WEB_ORIGINS: "https://mirai.engynex.com", LOG_LEVEL: "silent", RATE_LIMIT_DEFAULT_PER_MIN: "10000",
  })
  const logger = createLogger({ level: "silent", service: "mirai-api", version: "test", project: undefined, destination: { write: () => {} } })
  const { supabase, google } = await signers()
  const f = { tables: new FakeBookTablesRepo(), insights: new FakeInsightsRepo(), refs: new FakeRefsRepo(), gami: new FakeGamiRepo(), ads: new FakeAdsRepo(), bell: new FakeBellRepo() }
  f.bell.reset()
  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger }), ...(o.modules ?? [])] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier).useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo).useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(BookTablesRepo).useValue(f.tables)
    .overrideProvider(InsightsRepo).useValue(f.insights)
    .overrideProvider(RefsRepo).useValue(f.refs)
    .overrideProvider(GamiRepo).useValue(f.gami)
    .overrideProvider(AdsRepo).useValue(f.ads)
    .overrideProvider(BellRepo).useValue(f.bell)
    .compile()
  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, ...f, close: () => app.close() }
}
