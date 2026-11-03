// Datos de referencia de Colombia (tablas `ref_*`, lectura pública con fuente oficial; ver .agents/rules/colombia.md).
// F2-C-2: GET /v1/refs/{uvt,smmlv,trm,usura,festivos,renta-calendar,renta-regimenes}. Cambian poco: van con caché HTTP
// (`Cache-Control: public, max-age=300, s-maxage=3600`). Los sirve el módulo insights de la API (carpeta insights/refs).
// Sin `meta`: no es uno de los 31 módulos de §2.6.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { COMMON_ERRORS, IsoDate } from "../common"

export const REFS_CACHE = "public, max-age=300, s-maxage=3600"

const Year = z.coerce.number({ error: "Año inválido" }).int("Año inválido").min(2000, "Año inválido").max(2100, "Año inválido")
const Limit = z.coerce.number({ error: "Número inválido" }).int().min(1, "Mínimo 1").max(400, "Máximo 400")

export const AnioValor = z.object({ year: z.number(), valor: z.number(), fuente: z.string().nullable() })
export const Trm = z.object({ fecha: z.string(), valor: z.number(), fuente: z.string().nullable() })
export const Usura = z.object({ desde: z.string(), hasta: z.string(), modalidad: z.string(), tasa_ea: z.number() })
export const Festivo = z.object({ fecha: z.string(), nombre: z.string() })
export const RentaFecha = z.object({ year: z.number(), digitos: z.string(), regimen: z.string(), fecha: z.string() })
export const RentaRegimen = z.object({ key: z.string(), nombre: z.string(), descripcion: z.string(), norma: z.string(), seccionales: z.array(z.string()) })
export type AnioValor = z.infer<typeof AnioValor>
export type Trm = z.infer<typeof Trm>
export type Usura = z.infer<typeof Usura>
export type Festivo = z.infer<typeof Festivo>
export type RentaFecha = z.infer<typeof RentaFecha>
export type RentaRegimen = z.infer<typeof RentaRegimen>

export const LimitQuery = z.object({ limit: Limit.optional() })
export const FestivosQuery = z.object({ year: Year.optional(), desde: IsoDate.optional() })
export const RentaCalendarQuery = z.object({
  /** Últimos dos dígitos del NIT (como `profiles.digitos`). */
  digitos: z.string().regex(/^\d{2}$/, "Escribe los dos últimos dígitos de tu NIT").optional(),
  year: Year.optional(),
})

const c = initContract()
export const refsContract = c.router(
  {
    uvt: { method: "GET", path: "/v1/refs/uvt", responses: { ...COMMON_ERRORS, 200: z.array(AnioValor) }, summary: "UVT por año (ref_uvt)" },
    smmlv: { method: "GET", path: "/v1/refs/smmlv", responses: { ...COMMON_ERRORS, 200: z.array(AnioValor) }, summary: "Salario mínimo por año (ref_smmlv)" },
    trm: { method: "GET", path: "/v1/refs/trm", query: LimitQuery, responses: { ...COMMON_ERRORS, 200: z.array(Trm) }, summary: "TRM más reciente primero (ref_trm; 1 por defecto)" },
    usura: { method: "GET", path: "/v1/refs/usura", query: LimitQuery, responses: { ...COMMON_ERRORS, 200: z.array(Usura) }, summary: "Tasa de usura más reciente primero (ref_usury_rate; 1 por defecto)" },
    festivos: { method: "GET", path: "/v1/refs/festivos", query: FestivosQuery, responses: { ...COMMON_ERRORS, 200: z.array(Festivo) }, summary: "Festivos de Colombia (ref_holidays), por año o desde una fecha" },
    rentaCalendar: { method: "GET", path: "/v1/refs/renta-calendar", query: RentaCalendarQuery, responses: { ...COMMON_ERRORS, 200: z.array(RentaFecha) }, summary: "Calendario de renta de la DIAN por dígitos y año (ref_renta_calendar)" },
    rentaRegimenes: { method: "GET", path: "/v1/refs/renta-regimenes", responses: { ...COMMON_ERRORS, 200: z.array(RentaRegimen) }, summary: "Regímenes del calendario de renta (ref_renta_regimenes)" },
  },
  { strictStatusCodes: true },
)
