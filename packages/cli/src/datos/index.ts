// Lo que consumen las dos caras de la consola (la TUI y el servidor web). Ninguna calcula nada por su lado.
export * from "./ambientes.ts"
export * from "./comandos.ts"
export * from "./contenido.ts"
export * from "./infra.ts"
export * from "./modulos.ts"
export * from "./repo.ts"
export * from "./salud-local.ts"
export * from "./salud-prod.ts"
export * from "./salud-repo.ts"
export * from "./salud-vps.ts"
export * from "./tipos.ts"

import { estadoAmbientes, type EstadoAmbiente } from "./ambientes.ts"
import { infraestructura } from "./infra.ts"
import { arquitectura } from "./modulos.ts"
import { monorepo, stack } from "./repo.ts"
import { saludLocal } from "./salud-local.ts"
import { DOMINIO_POR_DEFECTO, saludProduccion } from "./salud-prod.ts"
import { saludRepo } from "./salud-repo.ts"
import { bloqueApagado } from "./salud-vps.ts"
import type { Bloque, Seccion } from "./tipos.ts"

export type Panel = "ambientes" | "salud" | "stack" | "infra" | "arquitectura" | "comandos"

export const PANELES: { id: Panel; titulo: string; descripcion: string }[] = [
  { id: "ambientes", titulo: "Ambientes", descripcion: "Levanta y apaga Mirai en este computador." },
  { id: "salud", titulo: "Salud", descripcion: "Cómo está todo ahora mismo." },
  { id: "stack", titulo: "Stack", descripcion: "Con qué está hecho Mirai." },
  { id: "infra", titulo: "Infraestructura", descripcion: "Dónde corre y con qué servicios." },
  { id: "arquitectura", titulo: "Arquitectura", descripcion: "Cómo está armado por dentro." },
  { id: "comandos", titulo: "Comandos", descripcion: "Las tareas de siempre, sin recordar el comando." },
]

/** Los tres bloques rápidos de salud (el del VPS va aparte: es a pulso). */
export async function salud(dominio = DOMINIO_POR_DEFECTO): Promise<Bloque[]> {
  const [local, prod, repo] = await Promise.all([saludLocal(), saludProduccion(dominio), saludRepo()])
  return [local, prod, repo, bloqueApagado()]
}

/** Lo que se sirve por JSON en /api/<panel> y lo que imprime `pnpm mirai <panel> --json`. */
export async function panel(id: Panel, dominio = DOMINIO_POR_DEFECTO): Promise<{ bloques?: Bloque[]; secciones?: Seccion[]; ambientes?: EstadoAmbiente[] }> {
  switch (id) {
    case "ambientes":
      return { ambientes: await estadoAmbientes() }
    case "salud":
      return { bloques: await salud(dominio) }
    case "stack":
      return { secciones: [stack(), monorepo()] }
    case "infra":
      return { secciones: infraestructura() }
    case "arquitectura":
      return { secciones: arquitectura() }
    case "comandos": {
      const { COMANDOS } = await import("./comandos.ts")
      return {
        secciones: [
          {
            id: "comandos",
            titulo: "Comandos",
            descripcion: "Los de riesgo alto piden confirmación escrita.",
            filas: COMANDOS.map((c) => ({ id: c.id, nombre: c.titulo, valor: `${c.cmd} ${c.args.join(" ")}`, detalle: c.detalle, grupo: c.grupo })),
          },
        ],
      }
    }
  }
}
