// El catálogo de comandos que la consola sabe correr, con su nivel de riesgo.
// Todos existen ya en el package.json de la raíz (o en infra/): la consola los envuelve, no los reinventa.
import { AMBIENTES } from "./ambientes.ts"

export type Riesgo = "ninguno" | "alto"

export type Comando = {
  id: string
  titulo: string
  /** Qué hace, en español, para quien no se acuerda del comando. */
  detalle: string
  cmd: string
  args: string[]
  riesgo: Riesgo
  /** Lo que hay que escribir para confirmar, cuando el riesgo es alto. */
  confirmacion?: string
  /** Advertencia que se muestra antes de confirmar. */
  advertencia?: string
  /** true si toma la pantalla y no termina solo (dev, e2e). */
  largo?: boolean
  grupo: string
}

/** Prender y apagar cada ambiente, derivado de AMBIENTES para no repetir el comando en dos lados. */
const DE_AMBIENTES: Comando[] = AMBIENTES.flatMap((a) => [
  {
    id: `prender-${a.id}`,
    titulo: `Levantar: ${a.titulo}`,
    detalle: `${a.detalle} (${a.tarda})`,
    cmd: a.levantar.cmd,
    args: a.levantar.args,
    riesgo: "ninguno" as const,
    largo: a.largo,
    grupo: "Ambientes",
  },
  ...(a.apagar
    ? [{
        id: `apagar-${a.id}`,
        titulo: `Apagar: ${a.titulo}`,
        detalle: a.id === "produccion" ? "Apaga el despliegue de prueba y borra sus volúmenes." : "Apaga los contenedores. Los datos quedan guardados.",
        cmd: a.apagar.cmd,
        args: a.apagar.args,
        riesgo: "ninguno" as const,
        grupo: "Ambientes",
      }]
    : []),
])

export const COMANDOS: Comando[] = [
  ...DE_AMBIENTES,

  { id: "lint", titulo: "Revisar el estilo", detalle: "ESLint en todo el monorepo. Tiene que quedar en cero errores.", cmd: "pnpm", args: ["lint"], riesgo: "ninguno", grupo: "Revisar" },
  { id: "typecheck", titulo: "Revisar los tipos", detalle: "TypeScript en la web y en cada paquete.", cmd: "pnpm", args: ["typecheck"], riesgo: "ninguno", grupo: "Revisar" },
  { id: "test", titulo: "Pruebas de los cálculos", detalle: "Vitest: dominio, contratos, web y API.", cmd: "pnpm", args: ["test"], riesgo: "ninguno", grupo: "Revisar" },
  { id: "secretos", titulo: "Buscar secretos", detalle: "Revisa que no se haya colado una llave en el código.", cmd: "pnpm", args: ["secretos"], riesgo: "ninguno", grupo: "Revisar" },
  { id: "build", titulo: "Compilar", detalle: "La compilación de producción de la web y los paquetes.", cmd: "pnpm", args: ["build"], riesgo: "ninguno", grupo: "Revisar" },
  { id: "e2e", titulo: "Batería de pantalla", detalle: "Playwright en escritorio (1366 px) y celular (400 px) contra el stack local. Tarda.", cmd: "pnpm", args: ["e2e:local"], riesgo: "ninguno", largo: true, grupo: "Revisar" },

  { id: "migr-pendientes", titulo: "Ver migraciones pendientes", detalle: "Qué le falta a la base del VPS. No cambia nada.", cmd: "pnpm", args: ["db:migrate:vps", "--", "--pendientes"], riesgo: "ninguno", grupo: "Base de datos" },
  {
    id: "migrar-vps",
    titulo: "Migrar la base del VPS",
    detalle: "Aplica el esquema a la base de PRODUCCIÓN por túnel SSH.",
    cmd: "pnpm",
    args: ["db:migrate:vps"],
    riesgo: "alto",
    confirmacion: "MIGRAR",
    advertencia: "Esto toca la base de producción (mirai.engynex.com). Mira primero las migraciones pendientes.",
    grupo: "Base de datos",
  },
  {
    id: "local-reset",
    titulo: "Borrar y rehacer la base local",
    detalle: "Borra los volúmenes de Docker y vuelve a crear todo desde cero.",
    cmd: "pnpm",
    args: ["local:reset"],
    riesgo: "alto",
    confirmacion: "BORRAR",
    advertencia: "Se pierde todo lo que tengas en la base local de este computador.",
    grupo: "Base de datos",
  },
]

export const porGrupo = () => {
  const grupos = new Map<string, Comando[]>()
  for (const c of COMANDOS) grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c])
  return [...grupos.entries()]
}
