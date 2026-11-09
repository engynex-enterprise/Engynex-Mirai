// Salud de producción: pings por HTTPS a las rutas que deben responder siempre.
import { pedir } from "./ejecutar.ts"
import { type Bloque, type Chequeo, estadoPorMs, peorEstado } from "./tipos.ts"

export const DOMINIO_POR_DEFECTO = "mirai.engynex.com"

/** Qué se consulta y qué se considera sano en cada ruta. */
const RUTAS: { ruta: string; que: string; esperado: number[] }[] = [
  { ruta: "/login", que: "la pantalla de entrar", esperado: [200] },
  { ruta: "/api/auth/ok", que: "el login (Better Auth)", esperado: [200] },
  { ruta: "/sw.js", que: "el modo sin conexión", esperado: [200] },
  // /healthz y /readyz son internos de la API: el dominio público solo reenvía /api/auth y /v1,
  // así que desde afuera responden 307 (el proxy manda al login). La señal de vida de la API es /v1/version.
  { ruta: "/v1/version", que: "la API responde y qué versión está publicada", esperado: [200] },
  { ruta: "/", que: "la raíz manda al login o a la app", esperado: [200, 307, 302] },
]

export async function saludProduccion(dominio = DOMINIO_POR_DEFECTO): Promise<Bloque> {
  const chequeos: Chequeo[] = await Promise.all(
    RUTAS.map(async ({ ruta, que, esperado }): Promise<Chequeo> => {
      const r = await pedir(`https://${dominio}${ruta}`)
      if (r.codigo === null) {
        return { id: ruta, titulo: ruta, estado: "error", detalle: `${que}: ${r.error}`, ms: r.ms, arregla: "Mira Dokploy y el registro de 'Desplegar VPS'." }
      }
      const bien = esperado.includes(r.codigo)
      return {
        id: ruta,
        titulo: ruta,
        estado: bien ? estadoPorMs(r.ms) : "error",
        detalle: bien ? que : `${que}: respondió ${r.codigo} (esperaba ${esperado.join(" o ")})`,
        ms: r.ms,
      }
    }),
  )
  return {
    id: "produccion",
    titulo: "Producción",
    descripcion: `Lo que ve la gente en ${dominio}.`,
    estado: peorEstado(chequeos.map((c) => c.estado)),
    chequeos,
  }
}
