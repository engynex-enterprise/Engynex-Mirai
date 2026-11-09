#!/usr/bin/env node
// La consola de Mirai. Punto de entrada: decide si abre la TUI, el navegador o imprime texto.
//
//   pnpm mirai                   la consola en la terminal
//   pnpm mirai salud             abre directo en ese panel
//   pnpm mirai salud --json      imprime JSON y sale (para scripts y agentes)
//   pnpm mirai --web             la misma información en el navegador
import { render } from "ink"
import { App } from "./app.tsx"
import { panel, type Panel, PANELES } from "./datos/index.ts"
import { DOMINIO_POR_DEFECTO } from "./datos/salud-prod.ts"
import type { Bloque, Seccion } from "./datos/tipos.ts"
import { limpiarAlSalir } from "./raton.ts"
import { fijarSinColor } from "./ui/tema.ts"

const args = process.argv.slice(2)
const bandera = (n: string) => args.includes(`--${n}`)
const valor = (n: string, porDefecto: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto
}

const PANELES_VALIDOS = [...PANELES.map((p) => p.id), "ayuda"] as const
const pedido = args.find((a) => !a.startsWith("--")) as Panel | "ayuda" | undefined
const dominio = valor("dominio", DOMINIO_POR_DEFECTO)

if (bandera("sin-color")) fijarSinColor(true)

function uso() {
  console.log(`
  Mirai 未来 — la consola del monorepo

  pnpm mirai                     la consola en la terminal
  pnpm mirai <panel>             abre directo en un panel
  pnpm mirai <panel> --json      imprime JSON y sale
  pnpm mirai --web               la misma información en el navegador

  Paneles: ${PANELES.map((p) => p.id).join(" · ")}

  Opciones
    --web                 abre la versión del navegador (127.0.0.1)
    --puerto <n>          el puerto de la versión web (4700 por defecto)
    --no-abrir            no abre el navegador solo
    --dominio <dominio>   cuál revisar en el panel de salud (${DOMINIO_POR_DEFECTO})
    --sin-color           sin color (también con NO_COLOR en el entorno)
    --sin-raton           no activa el ratón en la terminal
    --json                imprime JSON en vez de abrir la consola
    --ayuda               esto
`)
}

/** Texto plano para cuando no hay terminal interactiva (tuberías, CI). */
function imprimirPlano(datos: { bloques?: Bloque[]; secciones?: Seccion[] }) {
  const marca = { ok: "[ok]", aviso: "[!]", error: "[x]", apagado: "[-]" } as const
  for (const b of datos.bloques ?? []) {
    console.log(`\n${marca[b.estado]} ${b.titulo} — ${b.descripcion}`)
    for (const c of b.chequeos) {
      console.log(`   ${marca[c.estado]} ${c.titulo}: ${c.detalle}${c.ms !== undefined ? ` (${c.ms} ms)` : ""}`)
      if (c.arregla) console.log(`      → ${c.arregla}`)
    }
  }
  for (const s of datos.secciones ?? []) {
    console.log(`\n${s.titulo} — ${s.descripcion}`)
    for (const f of s.filas) console.log(`   ${f.nombre.padEnd(28)} ${(f.valor ?? "").padEnd(20)} ${f.detalle}`)
  }
}

/** Código 2 si algo quedó en rojo: así se puede encadenar en un script. */
const hayRojo = (datos: { bloques?: Bloque[] }) => (datos.bloques ?? []).some((b) => b.estado === "error")

async function principal() {
  if (bandera("ayuda") || bandera("help") || pedido === "ayuda") return uso()

  if (bandera("web")) {
    const { abrirWeb } = await import("./web/servidor.ts")
    await abrirWeb({ puerto: Number(valor("puerto", "4700")), abrir: !bandera("no-abrir"), dominio })
    return
  }

  const elegido = (pedido && (PANELES_VALIDOS as readonly string[]).includes(pedido) ? pedido : undefined) as Panel | undefined

  if (bandera("json")) {
    const datos = await panel(elegido ?? "salud", dominio)
    console.log(JSON.stringify(datos, null, 2))
    process.exit(hayRojo(datos) ? 2 : 0)
  }

  // Sin terminal interactiva no se dibuja la TUI: se imprime y ya.
  if (!process.stdout.isTTY) {
    if (!elegido) return uso()
    const datos = await panel(elegido, dominio)
    imprimirPlano(datos)
    process.exit(hayRojo(datos) ? 2 : 0)
  }

  limpiarAlSalir()
  const { waitUntilExit } = render(<App inicial={elegido ?? "salud"} dominio={dominio} sinRaton={bandera("sin-raton")} />)
  await waitUntilExit()
}

principal().catch((e: unknown) => {
  console.error("La consola falló:", e instanceof Error ? e.message : e)
  process.exit(1)
})
