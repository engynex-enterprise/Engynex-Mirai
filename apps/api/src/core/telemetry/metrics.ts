// Métricas de negocio de la API (V7-Q) con la API estándar de OpenTelemetry. Sin SDK encendido (OTEL_METRICS_EXPORTER
// vacío o "none") todo es no-op: no cuesta nada ni depende de ningún proveedor. Con el SDK (src/otel.ts) salen por OTLP
// al colector de cada nube (Cloud Monitoring, CloudWatch, Azure Monitor). Nunca montos ni datos personales en atributos.
import { metrics, type Attributes, type Counter, type Histogram } from "@opentelemetry/api"

const meter = () => metrics.getMeter("mirai-api")

// Buckets propios (los del SDK llegan solo a 10 000, que no sirve para bytes ni para tareas largas).
const JOB_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000]
const FILE_BYTES = [1e3, 1e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2.5e7, 5e7, 1e8]

let cache: { enq?: Counter; jobs?: Histogram; files?: Counter; fileBytes?: Histogram } = {}

/** Para las pruebas: vuelve a pedir los instrumentos al proveedor global vigente. */
export function resetMetricsCache() {
  cache = {}
}

/** Tarea encolada (`deduped` = ya existía con ese nombre). */
export function countEnqueue(attrs: { driver: string; queue: string; deduped: boolean }) {
  ;(cache.enq ??= meter().createCounter("mirai.queue.enqueued", { description: "Tareas encoladas" })).add(1, attrs as Attributes)
}

/** Tarea procesada por el trabajador (MODE=worker) con su resultado y duración en ms. */
export function recordJob(attrs: { driver: string; queue: string; ok: boolean }, ms: number) {
  ;(cache.jobs ??= meter().createHistogram("mirai.queue.job.duration", { description: "Duración de cada tarea", unit: "ms", advice: { explicitBucketBoundaries: JOB_MS } })).record(ms, attrs as Attributes)
}

/** Operación de archivos (firmar subida/descarga, completar, borrar…). */
export function countFiles(attrs: { op: string; bucket: string; driver: string; ok?: boolean }) {
  ;(cache.files ??= meter().createCounter("mirai.files.ops", { description: "Operaciones de archivos" })).add(1, { ok: true, ...attrs } as Attributes)
}

/** Tamaño de los archivos subidos (bytes). */
export function recordFileBytes(attrs: { bucket: string; driver: string }, bytes: number) {
  ;(cache.fileBytes ??= meter().createHistogram("mirai.files.bytes", { description: "Tamaño de los archivos subidos", unit: "By", advice: { explicitBucketBoundaries: FILE_BYTES } })).record(bytes, attrs as Attributes)
}
