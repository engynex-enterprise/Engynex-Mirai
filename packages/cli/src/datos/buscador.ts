// El buscador global: escribes "gastos" y te dice dónde vive eso — en la API, en la web, en la base,
// en los servicios, en los comandos y en los ambientes. Todo del repositorio de verdad.
import { AMBIENTES } from "./ambientes.ts"
import { COMANDOS } from "./comandos.ts"
import { endpoints } from "./endpoints.ts"
import { infraestructura } from "./infra.ts"
import { modulosApi, seccionesWeb } from "./modulos.ts"
import { monorepo, stack } from "./repo.ts"
import { SUITES } from "./pruebas.ts"

export type Hallazgo = {
  id: string
  /** De dónde salió, para que la persona sepa qué está viendo. */
  tipo: "Ambiente" | "Comando" | "Módulo de la API" | "Endpoint" | "Sección de la web" | "Servicio" | "Paquete" | "Tecnología" | "Batería de pruebas" | "Variable"
  titulo: string
  detalle: string
  /** Dónde está, si aplica (ruta en el repositorio, URL, puerto…). */
  donde?: string
  /** El panel al que lleva. */
  panel: string
  /** Cuánto pega con lo buscado (más alto = mejor). */
  peso: number
}

/** Quita tildes y pasa a minúscula, para buscar como la gente escribe. */
export const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

let cache: Omit<Hallazgo, "peso">[] | null = null

/** Arma el índice una sola vez (lee el repositorio; no cambia mientras la consola está abierta). */
export function indice(): Omit<Hallazgo, "peso">[] {
  if (cache) return cache
  const out: Omit<Hallazgo, "peso">[] = []

  for (const a of AMBIENTES) {
    out.push({ id: `amb:${a.id}`, tipo: "Ambiente", titulo: a.titulo, detalle: a.detalle, donde: a.puertos.map((p) => p.puerto).join(", "), panel: "ambientes" })
  }
  for (const c of COMANDOS) out.push({ id: `cmd:${c.id}`, tipo: "Comando", titulo: c.titulo, detalle: c.detalle, donde: `${c.cmd} ${c.args.join(" ")}`, panel: "comandos" })
  for (const m of modulosApi()) out.push({ id: `mod:${m.id}`, tipo: "Módulo de la API", titulo: m.nombre, detalle: m.detalle, donde: m.valor, panel: "arquitectura" })
  for (const e of endpoints()) {
    out.push({ id: `ep:${e.id}`, tipo: "Endpoint", titulo: `${e.metodo} ${e.ruta}`, detalle: e.resumen, donde: `módulo ${e.modulo}`, panel: "endpoints" })
  }
  for (const s of seccionesWeb()) {
    if (s.id === "secs") continue
    out.push({ id: `sec:${s.id}`, tipo: "Sección de la web", titulo: s.nombre, detalle: s.detalle || "Una sección del menú de Mirai.", donde: s.valor, panel: "arquitectura" })
  }
  for (const sec of infraestructura()) {
    if (!sec.titulo.startsWith("Servicios")) continue
    for (const f of sec.filas) out.push({ id: `srv:${sec.id}:${f.id}`, tipo: "Servicio", titulo: f.nombre, detalle: f.detalle, donde: f.valor, panel: "infra" })
  }
  for (const p of monorepo().filas) out.push({ id: `pkg:${p.id}`, tipo: "Paquete", titulo: p.nombre, detalle: p.detalle, donde: p.valor, panel: "stack" })
  for (const t of stack().filas) out.push({ id: `tec:${t.id}`, tipo: "Tecnología", titulo: t.nombre, detalle: t.detalle, donde: `v${t.valor}`, panel: "stack" })
  for (const s of SUITES) out.push({ id: `test:${s.id}`, tipo: "Batería de pruebas", titulo: s.titulo, detalle: s.detalle, donde: `${s.cmd} ${s.args.join(" ")}`, panel: "pruebas" })

  cache = out
  return out
}

/**
 * Busca en todo. Pesa el título por encima del detalle, y el comienzo de palabra por encima
 * del medio: buscar "gasto" debe traer primero el módulo `expenses` que una frase que lo mencione.
 */
export function buscar(consulta: string, tope = 40): Hallazgo[] {
  const q = normalizar(consulta.trim())
  if (q.length < 2) return []
  const palabras = q.split(/\s+/).filter(Boolean)
  const salida: Hallazgo[] = []

  for (const it of indice()) {
    const titulo = normalizar(it.titulo)
    const detalle = normalizar(it.detalle)
    const donde = normalizar(it.donde ?? "")
    let peso = 0
    for (const p of palabras) {
      if (titulo === p) peso += 100
      else if (titulo.startsWith(p)) peso += 60
      else if (new RegExp(`\\b${p}`).test(titulo)) peso += 40
      else if (titulo.includes(p)) peso += 20
      else if (new RegExp(`\\b${p}`).test(detalle)) peso += 10
      else if (detalle.includes(p)) peso += 5
      else if (donde.includes(p)) peso += 4
      else {
        peso = 0
        break // todas las palabras tienen que aparecer
      }
    }
    if (peso > 0) salida.push({ ...it, peso })
  }
  return salida.sort((a, b) => b.peso - a.peso || a.titulo.localeCompare(b.titulo)).slice(0, tope)
}

/** Cuántas cosas hay indexadas, por tipo (para mostrar en la pantalla vacía del buscador). */
export function resumenIndice(): { tipo: string; cuantos: number }[] {
  const m = new Map<string, number>()
  for (const it of indice()) m.set(it.tipo, (m.get(it.tipo) ?? 0) + 1)
  return [...m.entries()].map(([tipo, cuantos]) => ({ tipo, cuantos })).sort((a, b) => b.cuantos - a.cuantos)
}
