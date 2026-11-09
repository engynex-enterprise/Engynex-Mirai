// Tipos que comparten las dos caras de la consola (terminal y navegador). Nada de aquí sabe cómo se pinta.

/** Cómo quedó un chequeo. `apagado` = todavía no se consultó (p. ej. el VPS, que es a pulso). */
export type Estado = "ok" | "aviso" | "error" | "apagado"

/** Una línea de información con semáforo. */
export type Chequeo = {
  id: string
  titulo: string
  estado: Estado
  /** Qué pasó, en español y en una línea. */
  detalle: string
  /** Milisegundos que tardó, cuando aplica (red, procesos). */
  ms?: number
  /** Qué hacer si salió mal. */
  arregla?: string
}

/** Un grupo de chequeos (Local, Producción, Repo y CI, VPS). */
export type Bloque = {
  id: string
  titulo: string
  descripcion: string
  estado: Estado
  chequeos: Chequeo[]
  /** true si hay que pedirlo a mano (Enter en la TUI, botón en la web). */
  aPulso?: boolean
}

/** Una fila de cualquiera de las tablas de información (stack, servicios, módulos…). */
export type Fila = {
  id: string
  nombre: string
  valor?: string
  detalle: string
  /** Para agrupar visualmente. */
  grupo?: string
}

export type Seccion = {
  id: string
  titulo: string
  descripcion: string
  filas: Fila[]
}

/** El peor estado de una lista manda: error > aviso > apagado > ok. */
export function peorEstado(estados: Estado[]): Estado {
  if (estados.includes("error")) return "error"
  if (estados.includes("aviso")) return "aviso"
  if (estados.every((e) => e === "apagado")) return "apagado"
  return "ok"
}

/**
 * Semáforo por tiempo de respuesta: verde < 1,2 s, amarillo < 3 s, rojo de ahí para arriba.
 * Los umbrales son para un servidor remoto por HTTPS desde Colombia, no para localhost.
 */
export function estadoPorMs(ms: number): Estado {
  if (ms < 1200) return "ok"
  if (ms < 3000) return "aviso"
  return "error"
}
