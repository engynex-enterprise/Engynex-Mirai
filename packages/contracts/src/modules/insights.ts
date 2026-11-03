// Módulo `insights` (docs/arquitectura/v6-separacion-front-back.md §2.6, F2-C-4). Dueño: F2-C.
// Vistas de solo lectura calculadas en la API con @mirai/domain sobre el libro completo (las mismas partes de
// loadBookData + los extras del flujo integral: estimados de impuestos, mesadas, fondo y la Declaración de renta).
// Dan EXACTAMENTE las cifras que hoy calcula la web en el navegador (Inicio, Balance, Dashboard, Flujo de caja, Salud,
// Agenda, Hallazgos y Reportes). La web sigue calculando en el cliente (§3.4); estas rutas sirven al chat, los avisos,
// el contador y clientes nativos.
//
// Las salidas son los tipos de @mirai/domain (z.custom: el OpenAPI las muestra como objeto libre y el cliente tipado
// recibe el tipo exacto). `hoy` (opcional, AAAA-MM-DD) fija la fecha de referencia; por defecto, hoy en Colombia.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { AgendaItem, Notif } from "@mirai/domain/agenda"
import type { MesProyeccion } from "@mirai/domain/dashboard"
import type { EstadoIntegral, FlujoIntegral, ParteEstado } from "@mirai/domain/flujo-integral"
import type { HealthScore, Indicador } from "@mirai/domain/indicators"
import type { Insight } from "@mirai/domain/insights"
import type { ReportData } from "@mirai/domain/report"
import { PERIODOS_DASHBOARD, PESTANAS_BALANCE, type VistaBalance, type VistaDashboard, type VistaInicio } from "@mirai/domain/vistas"
import { ApiError, COMMON_ERRORS, IsoDate, IsoMonth, Uuid } from "../common"

export const meta = { id: "insights", owner: "F2-C" } as const

export const BookParams = z.object({ bookId: Uuid })
const Hoy = z.object({ hoy: IsoDate.optional() })

export const FlujoQuery = Hoy.extend({
  /** Quincena (q1/q2), mes, año o rango libre (con `a` y `b`). Por defecto, el mes. */
  tipo: z.enum(["q1", "q2", "mes", "anio", "rango"], { error: "Usa q1, q2, mes, anio o rango" }).optional(),
  /** Mes del periodo (AAAA-MM); por defecto, el de `hoy`. Para `anio` cuenta solo el año. */
  mes: IsoMonth.optional(),
  a: IsoDate.optional(),
  b: IsoDate.optional(),
})
export const BalanceQuery = Hoy.extend({ tab: z.enum(PESTANAS_BALANCE, { error: "Pestaña inválida" }).optional(), mes: IsoMonth.optional() })
export const DashboardQuery = Hoy.extend({ periodo: z.enum(PERIODOS_DASHBOARD, { error: "Periodo inválido" }).optional() })
export const ProyeccionQuery = Hoy.extend({ meses: z.coerce.number({ error: "Número inválido" }).int().min(1, "Mínimo 1 mes").max(36, "Máximo 36 meses").optional() })
export const HoyQuery = Hoy
export const ReportParams = z.object({ bookId: Uuid, mes: IsoMonth })

export const FlujoView = z.custom<FlujoIntegral>().describe("FlujoIntegral de @mirai/domain/flujo-integral")
export const EstadoView = z.custom<{ estado: EstadoIntegral; partes: { tengo: ParteEstado[]; debo: ParteEstado[] } }>().describe("Estado integral (lo que tienes y lo que debes)")
export const InicioView = z.custom<VistaInicio>().describe("vistaInicio de @mirai/domain/vistas")
export const BalanceView = z.custom<VistaBalance>().describe("vistaBalance de @mirai/domain/vistas")
export const DashboardView = z.custom<VistaDashboard>().describe("vistaDashboard de @mirai/domain/vistas")
export const ProyeccionView = z.custom<{ liquidez: number; meses: MesProyeccion[] }>().describe("proyeccionMeses de @mirai/domain/dashboard")
export const IndicadoresView = z.custom<{ indicadores: Indicador[]; salud: HealthScore }>().describe("indicadores y healthScore de @mirai/domain/indicators")
export const AgendaView = z.custom<{ agenda: AgendaItem[]; avisos: Notif[] }>().describe("agenda y notifs de @mirai/domain/agenda")
export const HallazgosView = z.custom<Insight[]>().describe("insights de @mirai/domain/insights")
export const ReportView = z.custom<ReportData>().describe("reportData de @mirai/domain/report")

const view = <Q extends z.ZodType, R extends z.ZodType>(path: string, query: Q, ok: R, summary: string) =>
  ({ method: "GET", path, pathParams: BookParams, query, responses: { ...COMMON_ERRORS, 200: ok }, summary }) as const

const c = initContract()
export const insightsContract = c.router(
  {
    flujoIntegral: view("/v1/books/:bookId/views/flujo-integral", FlujoQuery, FlujoView, "Todo lo que entra y sale en un periodo (flujoIntegral)"),
    estadoIntegral: view("/v1/books/:bookId/views/estado-integral", HoyQuery, EstadoView, "Lo que tienes y lo que debes hoy (estadoIntegral + partes)"),
    inicio: view("/v1/books/:bookId/views/inicio", HoyQuery, InicioView, "Te queda esta quincena y totales de Inicio"),
    balance: view("/v1/books/:bookId/views/balance", BalanceQuery, BalanceView, "Balance integral (estado, flujo de la pestaña, hallazgos y foto del mes)"),
    dashboard: view("/v1/books/:bookId/views/dashboard", DashboardQuery, DashboardView, "Dashboard (flujo, serie de 12 meses, compromisos, capacidad, deudas y decisiones)"),
    proyeccion: view("/v1/books/:bookId/views/proyeccion", ProyeccionQuery, ProyeccionView, "Flujo de caja de los próximos meses (proyeccionMeses)"),
    indicadores: view("/v1/books/:bookId/views/indicadores", HoyQuery, IndicadoresView, "Indicadores de salud financiera y puntaje"),
    agenda: view("/v1/books/:bookId/views/agenda", HoyQuery, AgendaView, "Próximos pagos y cobros (agenda) y avisos del libro (notifs)"),
    hallazgos: view("/v1/books/:bookId/views/hallazgos", HoyQuery, HallazgosView, "Hallazgos de tus gastos (qué subió, qué bajó, inusuales)"),
    report: {
      method: "GET",
      path: "/v1/books/:bookId/reports/:mes",
      pathParams: ReportParams,
      query: HoyQuery,
      responses: { ...COMMON_ERRORS, 200: ReportView, 404: ApiError },
      summary: "Reporte del mes (reportData)",
    },
  },
  { strictStatusCodes: true },
)
