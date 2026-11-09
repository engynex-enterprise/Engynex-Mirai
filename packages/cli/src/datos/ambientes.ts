// Los ambientes que se pueden levantar en este computador, qué está arriba y cómo prenderlo o apagarlo.
//
// Son tres y no se pisan entre sí porque usan puertos distintos:
//   desarrollo   55300/55080/55081  pnpm dev                    (recarga en caliente, cuenta de ejemplo)
//   produccion   56300/56081/56432  prueba-local.mjs            (el MISMO despliegue del VPS, compilado)
//   servicios    55432/55430/55379  pnpm local:up               (base, PostgREST, Redis y archivos; sin web)
import { correr, puertoOcupado } from "./ejecutar.ts"
import type { Estado } from "./tipos.ts"

export type Ambiente = {
  id: "desarrollo" | "produccion" | "servicios"
  titulo: string
  /** Para qué sirve, en español. */
  detalle: string
  /** Cuándo usarlo. */
  cuando: string
  /** El puerto por el que se entra (si tiene pantalla). */
  url?: string
  /** Los puertos que ocupa; el primero es el que manda para saber si está arriba. */
  puertos: { puerto: number; que: string }[]
  /** El proyecto de Docker Compose (para ver sus contenedores). */
  proyecto?: string
  levantar: { cmd: string; args: string[] }
  apagar?: { cmd: string; args: string[] }
  /** true si se queda pegado a la terminal (no vuelve el control hasta cortarlo). */
  largo?: boolean
  /** Cuánto suele tardar, para no creer que se colgó. */
  tarda: string
}

export const AMBIENTES: Ambiente[] = [
  {
    id: "desarrollo",
    titulo: "Desarrollo",
    detalle: "La base, la API, el tiempo real y la web con recarga en caliente. Trae una cuenta de ejemplo lista.",
    cuando: "Para trabajar en el día a día.",
    url: "http://localhost:55300",
    puertos: [
      { puerto: 55300, que: "web" },
      { puerto: 55080, que: "API" },
      { puerto: 55081, que: "tiempo real" },
    ],
    proyecto: "mirai-local",
    levantar: { cmd: "pnpm", args: ["dev"] },
    largo: true,
    tarda: "1 a 2 minutos la primera vez",
  },
  {
    id: "produccion",
    titulo: "Producción en este computador",
    detalle: "El MISMO despliegue del VPS: compose de producción, imágenes compiladas, sin recarga en caliente.",
    cuando: "Para probar un despliegue antes de subirlo a mirai.engynex.com.",
    url: "http://localhost:56300",
    puertos: [
      { puerto: 56300, que: "web" },
      { puerto: 56081, que: "tiempo real" },
      { puerto: 56432, que: "base" },
      { puerto: 56900, que: "archivos" },
    ],
    proyecto: "mirai-cprueba",
    levantar: { cmd: "node", args: ["infra/servidor/prueba-local.mjs"] },
    apagar: { cmd: "node", args: ["infra/servidor/prueba-local.mjs", "--down"] },
    largo: true,
    tarda: "5 a 10 minutos: compila las imágenes de producción",
  },
  {
    id: "servicios",
    titulo: "Solo los servicios",
    detalle: "Base, PostgREST, Redis y archivos en Docker. Sin la web ni la API.",
    cuando: "Para correr la web aparte o trabajar contra la base.",
    puertos: [
      { puerto: 55432, que: "base" },
      { puerto: 55430, que: "PostgREST" },
      { puerto: 55379, que: "Redis" },
      { puerto: 55900, que: "archivos" },
    ],
    proyecto: "mirai-local",
    levantar: { cmd: "pnpm", args: ["local:up"] },
    apagar: { cmd: "pnpm", args: ["local:down"] },
    tarda: "20 a 40 segundos",
  },
]

export type EstadoAmbiente = {
  ambiente: Ambiente
  estado: Estado
  /** Qué puertos están ocupados ahora mismo. */
  puertos: { puerto: number; que: string; ocupado: boolean }[]
  /** Resumen en español. */
  resumen: string
  /** Contenedores de su proyecto que están arriba. */
  contenedores: number
}

/** Qué hay arriba en este momento. */
export async function estadoAmbientes(): Promise<EstadoAmbiente[]> {
  const ps = await correr("docker", ["ps", "--format", "{{.Label \"com.docker.compose.project\"}}"], { ms: 6000 })
  const porProyecto = new Map<string, number>()
  for (const l of ps.out.split("\n").filter(Boolean)) porProyecto.set(l, (porProyecto.get(l) ?? 0) + 1)

  return Promise.all(
    AMBIENTES.map(async (ambiente): Promise<EstadoAmbiente> => {
      const puertos = await Promise.all(ambiente.puertos.map(async (p) => ({ ...p, ocupado: await puertoOcupado(p.puerto) })))
      const arriba = puertos.filter((p) => p.ocupado).length
      const contenedores = ambiente.proyecto ? (porProyecto.get(ambiente.proyecto) ?? 0) : 0
      // El primer puerto manda: si la puerta de entrada no responde, el ambiente está abajo aunque
      // queden restos de otra corrida (un contenedor de archivos suelto, por ejemplo).
      const principal = puertos[0]?.ocupado ?? false
      const faltan = puertos.filter((p) => !p.ocupado).map((p) => p.que)
      const estado: Estado = !principal ? "apagado" : faltan.length ? "aviso" : "ok"
      const resumen = !principal
        ? arriba > 0
          ? `apagado (quedan restos en ${puertos.filter((p) => p.ocupado).map((p) => p.puerto).join(", ")})`
          : "apagado"
        : faltan.length
          ? `a medias: ${faltan.join(", ")} sin responder`
          : `corriendo${ambiente.url ? ` en ${ambiente.url}` : ""}`
      return { ambiente, estado, puertos, resumen, contenedores }
    }),
  )
}

/** Quién está usando un puerto (para poder ofrecer cerrarlo). */
export async function quienUsa(puerto: number): Promise<{ pid: number; nombre: string }[]> {
  const r = await correr("lsof", ["-ti", `tcp:${puerto}`], { ms: 4000 })
  const pids = r.out.split("\n").map(Number).filter(Boolean)
  return Promise.all(
    pids.map(async (pid) => {
      const n = await correr("ps", ["-p", String(pid), "-o", "comm="], { ms: 3000 })
      return { pid, nombre: n.out.split("/").pop() ?? "desconocido" }
    }),
  )
}

/**
 * Libera un puerto trancado. Es lo que arregla el "El puerto 55300 está ocupado (¿otra corrida con --keep?)":
 * en vez de dejar el error en la cara, se ofrece cerrar lo que lo tiene tomado.
 */
export async function liberarPuerto(puerto: number): Promise<{ ok: boolean; msg: string }> {
  const duenos = await quienUsa(puerto)
  if (!duenos.length) return { ok: true, msg: `El puerto ${puerto} ya estaba libre.` }
  for (const d of duenos) await correr("kill", [String(d.pid)], { ms: 3000 })
  // Un momento para que suelte, y si no, en serio.
  await new Promise((r) => setTimeout(r, 700))
  if (await puertoOcupado(puerto)) {
    for (const d of duenos) await correr("kill", ["-9", String(d.pid)], { ms: 3000 })
    await new Promise((r) => setTimeout(r, 400))
  }
  const sigue = await puertoOcupado(puerto)
  return sigue
    ? { ok: false, msg: `No pude liberar el ${puerto} (${duenos.map((d) => d.nombre).join(", ")}). Ciérralo a mano: lsof -ti tcp:${puerto} | xargs kill -9` }
    : { ok: true, msg: `Puerto ${puerto} libre (cerré ${duenos.map((d) => `${d.nombre} ${d.pid}`).join(", ")}).` }
}

/**
 * Apaga un ambiente de verdad: cierra lo que tenga sus puertos tomados y, si además corre en Docker,
 * baja los contenedores. `pnpm dev` no tiene comando de apagado propio (se corta con Ctrl-C), y era
 * justo el que dejaba el puerto 55300 trancado para la siguiente corrida.
 */
export async function apagarAmbiente(id: Ambiente["id"]): Promise<{ ok: boolean; msg: string }> {
  const a = AMBIENTES.find((x) => x.id === id)
  if (!a) return { ok: false, msg: "No conozco ese ambiente." }
  const pasos: string[] = []
  for (const p of a.puertos) {
    if (!(await puertoOcupado(p.puerto))) continue
    const r = await liberarPuerto(p.puerto)
    pasos.push(r.msg)
    if (!r.ok) return { ok: false, msg: pasos.join(" ") }
  }
  if (a.apagar) {
    const r = await correr(a.apagar.cmd, a.apagar.args, { ms: 120000 })
    pasos.push(r.ok ? "Contenedores abajo." : `No pude bajar los contenedores: ${r.err.split("\n")[0]}`)
    if (!r.ok) return { ok: false, msg: pasos.join(" ") }
  }
  return { ok: true, msg: pasos.length ? `${a.titulo}: ${pasos.join(" ")}` : `${a.titulo} ya estaba apagado.` }
}

/** Los puertos ocupados que le estorban a este ambiente para arrancar. */
export async function puertosQueEstorban(id: Ambiente["id"]): Promise<number[]> {
  const a = AMBIENTES.find((x) => x.id === id)
  if (!a) return []
  const ocupados = await Promise.all(a.puertos.map(async (p) => ((await puertoOcupado(p.puerto)) ? p.puerto : 0)))
  return ocupados.filter(Boolean)
}
