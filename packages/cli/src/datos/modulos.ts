// Los módulos de la API y las secciones de la web, leídos del repositorio (no de una lista a mano).
import { readdirSync } from "node:fs"
import { FLUJO, MODULOS, REGLAS } from "./contenido.ts"
import { leer, ruta } from "./raiz.ts"
import type { Fila, Seccion } from "./tipos.ts"

/** Las carpetas de apps/api/src/modules. */
export function modulosApi(): Fila[] {
  let dirs: string[] = []
  try {
    dirs = readdirSync(ruta("apps/api/src/modules"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  } catch {
    return []
  }
  return dirs.map((id) => ({ id, nombre: id, valor: `apps/api/src/modules/${id}`, detalle: MODULOS[id] ?? "—", grupo: "Módulos de la API" }))
}

/**
 * Las secciones del menú de la web, sacadas de apps/web/lib/nav.ts.
 * Se lee con expresiones regulares a propósito: importar ese archivo arrastraría media web.
 * El archivo arma el menú con `leaf(id, label, icon)` y grupos `{ g, label, … }`.
 */
export function seccionesWeb(): Fila[] {
  const txt = leer("apps/web/lib/nav.ts")
  if (!txt) return []
  const vistos = new Set<string>()
  const filas: Fila[] = []
  // Los encabezados de sección: { sec: "General", … }
  const secciones = [...txt.matchAll(/\bsec:\s*"([^"]+)"/g)].map((m) => m[1])
  for (const m of txt.matchAll(/\bleaf\(\s*"([a-z0-9-]+)"\s*,\s*"([^"]+)"/g)) {
    const [, id, label] = m
    if (vistos.has(id)) continue
    vistos.add(id)
    filas.push({ id, nombre: label, valor: `/${id}`, detalle: "", grupo: "Secciones de la web" })
  }
  // Los grupos plegables del menú ({ g: "dinero", label: "Mi dinero" }).
  for (const m of txt.matchAll(/\bg:\s*"([a-z0-9-]+)"\s*,\s*label:\s*"([^"]+)"/g)) {
    const [, id, label] = m
    if (vistos.has(`g:${id}`)) continue
    vistos.add(`g:${id}`)
    filas.push({ id: `g:${id}`, nombre: label, valor: "(grupo)", detalle: "Agrupa varias secciones en el menú.", grupo: "Grupos del menú" })
  }
  if (secciones.length) {
    filas.unshift({ id: "secs", nombre: "Bloques del menú", valor: String(secciones.length), detalle: secciones.join(" · "), grupo: "Secciones de la web" })
  }
  return filas
}

export function arquitectura(): Seccion[] {
  return [
    {
      id: "flujo",
      titulo: "Cómo viaja un dato",
      descripcion: "De la pantalla a la base y de vuelta.",
      filas: FLUJO.map((f, i) => ({ id: String(i), nombre: f.paso, detalle: f.detalle })),
    },
    {
      id: "reglas",
      titulo: "Reglas que no se rompen",
      descripcion: "Lo que hay que respetar al tocar el código.",
      filas: REGLAS.map((r, i) => ({ id: String(i), nombre: r.titulo, detalle: r.detalle })),
    },
    {
      id: "modulos",
      titulo: "Módulos de la API",
      descripcion: "Leídos de apps/api/src/modules.",
      filas: modulosApi(),
    },
    {
      id: "secciones",
      titulo: "Secciones de la web",
      descripcion: "Leídas de apps/web/lib/nav.ts.",
      filas: seccionesWeb(),
    },
  ]
}
