// Lo que consumen las dos caras de la consola (la TUI y el servidor web). Ninguna calcula nada por su lado.
export * from "./ambientes.ts"
export * from "./base.ts"
export * from "./buscador.ts"
export * from "./comandos.ts"
export * from "./contenido.ts"
export * from "./despliegue.ts"
export * from "./endpoints.ts"
export * from "./git.ts"
export * from "./infra.ts"
export * from "./modulos.ts"
export * from "./pruebas.ts"
export * from "./recursos.ts"
export * from "./registros.ts"
export * from "./repo.ts"
export * from "./salud-local.ts"
export * from "./salud-prod.ts"
export * from "./salud-repo.ts"
export * from "./salud-vps.ts"
export * from "./tipos.ts"

import { estadoAmbientes, type EstadoAmbiente } from "./ambientes.ts"
import { estadoBase, tablas, type Tabla } from "./base.ts"
import { corridas, type Corrida } from "./despliegue.ts"
import { type Endpoint, endpoints } from "./endpoints.ts"
import { cambios, commits, type Commit, type GrupoCambios, situacion } from "./git.ts"
import { infraestructura } from "./infra.ts"
import { arquitectura } from "./modulos.ts"
import { capturas, type Captura, SUITES, type Suite, ultimaCorrida } from "./pruebas.ts"
import { discoDocker, discoEquipo, type Disco, usoContenedores, type Uso } from "./recursos.ts"
import { contenedores, type Contenedor } from "./registros.ts"
import { monorepo, stack } from "./repo.ts"
import { saludLocal } from "./salud-local.ts"
import { DOMINIO_POR_DEFECTO, saludProduccion } from "./salud-prod.ts"
import { saludRepo } from "./salud-repo.ts"
import { bloqueApagado } from "./salud-vps.ts"
import type { Bloque, Seccion } from "./tipos.ts"

export type Panel =
  | "ambientes"
  | "salud"
  | "registros"
  | "recursos"
  | "base"
  | "pruebas"
  | "git"
  | "despliegue"
  | "endpoints"
  | "stack"
  | "infra"
  | "arquitectura"
  | "comandos"

/** El menú, agrupado. El `grupo` solo sirve para pintar un separador. */
export const PANELES: { id: Panel; titulo: string; descripcion: string; grupo: string }[] = [
  { id: "ambientes", titulo: "Ambientes", descripcion: "Levanta y apaga Mirai en este computador.", grupo: "Operar" },
  { id: "salud", titulo: "Salud", descripcion: "Cómo está todo ahora mismo.", grupo: "Operar" },
  { id: "registros", titulo: "Registros", descripcion: "Lo que va diciendo cada servicio, en vivo.", grupo: "Operar" },
  { id: "recursos", titulo: "Recursos", descripcion: "Quién se está comiendo el computador.", grupo: "Operar" },
  { id: "base", titulo: "Base de datos", descripcion: "Las tablas, cómo son y qué tienen.", grupo: "Datos" },
  { id: "pruebas", titulo: "Pruebas", descripcion: "Correrlas y ver qué falló.", grupo: "Desarrollar" },
  { id: "git", titulo: "Cambios", descripcion: "Qué tocaste, por paquete.", grupo: "Desarrollar" },
  { id: "despliegue", titulo: "Despliegue", descripcion: "El CI y lo que se publicó.", grupo: "Desarrollar" },
  { id: "endpoints", titulo: "Endpoints", descripcion: "Todo lo que responde la API.", grupo: "Desarrollar" },
  { id: "stack", titulo: "Stack", descripcion: "Con qué está hecho Mirai.", grupo: "Saber" },
  { id: "infra", titulo: "Infraestructura", descripcion: "Dónde corre y con qué servicios.", grupo: "Saber" },
  { id: "arquitectura", titulo: "Arquitectura", descripcion: "Cómo está armado por dentro.", grupo: "Saber" },
  { id: "comandos", titulo: "Comandos", descripcion: "Las tareas de siempre, sin recordar el comando.", grupo: "Saber" },
]

/** Los tres bloques rápidos de salud (el del VPS va aparte: es a pulso). */
export async function salud(dominio = DOMINIO_POR_DEFECTO): Promise<Bloque[]> {
  const [local, prod, repo] = await Promise.all([saludLocal(), saludProduccion(dominio), saludRepo()])
  return [local, prod, repo, bloqueApagado()]
}

/** Todo lo que un panel necesita para pintarse. Es exactamente lo mismo en la terminal y en el navegador. */
export type DatosPanel = {
  bloques?: Bloque[]
  secciones?: Seccion[]
  ambientes?: EstadoAmbiente[]
  contenedores?: Contenedor[]
  uso?: Uso[]
  discoDocker?: { titulo: string; tamano: string; recuperable: string }[]
  disco?: Disco | null
  base?: { estado: Awaited<ReturnType<typeof estadoBase>>; tablas: Tabla[]; error?: string }
  pruebas?: { suites: Suite[]; capturas: Captura[]; ultima: string | null }
  git?: { situacion: Awaited<ReturnType<typeof situacion>>; grupos: GrupoCambios[]; commits: Commit[] }
  despliegue?: { ok: boolean; msg?: string; corridas: Corrida[] }
  endpoints?: Endpoint[]
}

export async function panel(id: Panel, dominio = DOMINIO_POR_DEFECTO): Promise<DatosPanel> {
  switch (id) {
    case "ambientes":
      return { ambientes: await estadoAmbientes() }
    case "salud":
      return { bloques: await salud(dominio) }
    case "registros":
      return { contenedores: await contenedores() }
    case "recursos": {
      const [uso, dd, disco] = await Promise.all([usoContenedores(), discoDocker(), discoEquipo()])
      return { uso, discoDocker: dd, disco }
    }
    case "base": {
      const [estado, t] = await Promise.all([estadoBase(), tablas()])
      return { base: { estado, tablas: t.ok ? t.datos : [], error: t.ok ? undefined : t.msg } }
    }
    case "pruebas": {
      const u = ultimaCorrida()
      return { pruebas: { suites: SUITES, capturas: capturas().slice(0, 60), ultima: u ? u.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : null } }
    }
    case "git": {
      const [s, g, cs] = await Promise.all([situacion(), cambios(), commits()])
      return { git: { situacion: s, grupos: g, commits: cs } }
    }
    case "despliegue":
      return { despliegue: await corridas() }
    case "endpoints":
      return { endpoints: endpoints() }
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
            filas: COMANDOS.map((x) => ({ id: x.id, nombre: x.titulo, valor: `${x.cmd} ${x.args.join(" ")}`, detalle: x.detalle, grupo: x.grupo })),
          },
        ],
      }
    }
  }
}
