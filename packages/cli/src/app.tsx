// La consola en la terminal. Junta el logo, el menú y el panel de la derecha, y maneja teclado y ratón.
import { Box, Text, useApp, useInput, useStdin } from "ink"
import Spinner from "ink-spinner"
import TextInput from "ink-text-input"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COMANDOS, type Comando } from "./datos/comandos.ts"
import { cortar, cortarTodo, type Ejecucion, lanzar } from "./datos/ejecucion.ts"
import { infraestructura } from "./datos/infra.ts"
import { arquitectura } from "./datos/modulos.ts"
import { identidad, monorepo, stack } from "./datos/repo.ts"
import { saludLocal } from "./datos/salud-local.ts"
import { DOMINIO_POR_DEFECTO, saludProduccion } from "./datos/salud-prod.ts"
import { saludRepo } from "./datos/salud-repo.ts"
import { bloqueApagado, saludVps } from "./datos/salud-vps.ts"
import type { Bloque, Fila, Seccion } from "./datos/tipos.ts"
import { parsearRaton, prenderRaton, zonaDeClic, type Zona } from "./raton.ts"
import { BloqueSalud } from "./ui/bloque-salud.tsx"
import { Lista } from "./ui/lista.tsx"
import { Logo } from "./ui/logo.tsx"
import { Marco } from "./ui/marco.tsx"
import { Menu, type Opcion } from "./ui/menu.tsx"
import { COLORES, color } from "./ui/tema.ts"

const OPCIONES: Opcion[] = [
  { id: "salud", titulo: "Salud" },
  { id: "stack", titulo: "Stack" },
  { id: "infra", titulo: "Infra" },
  { id: "arquitectura", titulo: "Arquitectura" },
  { id: "comandos", titulo: "Comandos" },
  { id: "ayuda", titulo: "Ayuda" },
]

/** La fila de la terminal donde empieza el menú (logo + marco). El ratón la necesita. */
const FILA_MENU = 8

type Props = { inicial?: string; dominio?: string; sinRaton?: boolean }

export function App({ inicial = "salud", dominio = DOMINIO_POR_DEFECTO, sinRaton }: Props) {
  const { exit } = useApp()
  const { stdin, setRawMode } = useStdin()
  // El tamaño sale de process.stdout y se vuelve a leer cuando cambia la ventana (Ink no lo avisa).
  const [tam, setTam] = useState(() => ({ cols: process.stdout.columns ?? 100, rows: process.stdout.rows ?? 30 }))
  useEffect(() => {
    const alCambiar = () => setTam({ cols: process.stdout.columns ?? 100, rows: process.stdout.rows ?? 30 })
    process.stdout.on("resize", alCambiar)
    return () => {
      process.stdout.off("resize", alCambiar)
    }
  }, [])
  const ancho = Math.max(60, tam.cols)
  const alto = Math.max(20, tam.rows)
  const anchoMenu = ancho >= 80 ? 20 : 0
  const anchoPanel = ancho - anchoMenu - 7

  const [panel, setPanel] = useState(inicial)
  const [foco, setFoco] = useState<"menu" | "contenido">("menu")
  const [seleccion, setSeleccion] = useState(0)
  const [desplazamiento, setDesplazamiento] = useState(0)
  const [filtro, setFiltro] = useState("")
  const [filtrando, setFiltrando] = useState(false)
  const [version] = useState(() => identidad().version)

  // Salud
  const [bloques, setBloques] = useState<Bloque[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>("local")

  // Comandos
  const [ejecucion, setEjecucion] = useState<Ejecucion | null>(null)
  const [, forzar] = useState(0)
  const [confirmando, setConfirmando] = useState<Comando | null>(null)
  const [textoConfirma, setTextoConfirma] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)

  const secciones: Seccion[] = useMemo(() => {
    if (panel === "stack") return [stack(), monorepo()]
    if (panel === "infra") return infraestructura()
    if (panel === "arquitectura") return arquitectura()
    return []
  }, [panel])

  const filas: Fila[] = useMemo(() => {
    const todas = secciones.flatMap((s) => s.filas.map((f) => ({ ...f, grupo: f.grupo ?? s.titulo })))
    if (!filtro) return todas
    const q = filtro.toLowerCase()
    return todas.filter((f) => `${f.nombre} ${f.valor ?? ""} ${f.detalle}`.toLowerCase().includes(q))
  }, [secciones, filtro])

  const comandosFiltrados = useMemo(() => {
    if (!filtro) return COMANDOS
    const q = filtro.toLowerCase()
    return COMANDOS.filter((c) => `${c.titulo} ${c.detalle}`.toLowerCase().includes(q))
  }, [filtro])

  const cargarSalud = useCallback(async () => {
    setCargando(true)
    const [local, prod, repo] = await Promise.all([saludLocal(), saludProduccion(dominio), saludRepo()])
    setBloques([local, prod, repo, bloqueApagado()])
    setCargando(false)
  }, [dominio])

  useEffect(() => {
    if (panel === "salud" && !bloques && !cargando) void cargarSalud()
  }, [panel, bloques, cargando, cargarSalud])

  // Al cambiar de panel, la selección y el desplazamiento vuelven al principio.
  useEffect(() => {
    setSeleccion(0)
    setDesplazamiento(0)
    setFiltro("")
    setFiltrando(false)
  }, [panel])

  const consultarVps = useCallback(async () => {
    setBloques((b) => b?.map((x) => (x.id === "vps" ? { ...x, estado: "apagado", chequeos: [{ id: "x", titulo: "Preguntando", estado: "apagado", detalle: "abriendo sesión SSH…" }] } : x)) ?? null)
    const vps = await saludVps()
    setBloques((b) => b?.map((x) => (x.id === "vps" ? vps : x)) ?? null)
  }, [])

  const correrComando = useCallback((c: Comando, confirmacion?: string) => {
    const r = lanzar(c.id, confirmacion)
    if (!r.ok) {
      setAviso(r.msg)
      return
    }
    setEjecucion(r.ejecucion)
    setAviso(null)
    r.ejecucion.eventos.on("linea", () => forzar((n) => n + 1))
    r.ejecucion.eventos.on("fin", () => forzar((n) => n + 1))
  }, [])

  const activar = useCallback(() => {
    if (panel === "salud" && bloques) {
      const b = bloques[seleccion]
      if (!b) return
      if (b.id === "vps") void consultarVps()
      else setAbierto((a) => (a === b.id ? null : b.id))
      return
    }
    if (panel === "comandos") {
      const c = comandosFiltrados[seleccion]
      if (!c) return
      if (c.riesgo === "alto") {
        setConfirmando(c)
        setTextoConfirma("")
      } else correrComando(c)
    }
  }, [panel, bloques, seleccion, comandosFiltrados, consultarVps, correrComando])

  const total = panel === "salud" ? (bloques?.length ?? 0) : panel === "comandos" ? comandosFiltrados.length : filas.length

  // ── Ratón ──────────────────────────────────────────────────────────────────
  const zonas = useRef<Zona[]>([])
  zonas.current = anchoMenu ? OPCIONES.map((o, i) => ({ id: `menu:${o.id}`, fila: FILA_MENU + i })) : []
  useEffect(() => {
    if (sinRaton || !stdin) return
    prenderRaton()
    setRawMode?.(true)
    const alDato = (d: Buffer | string) => {
      const ev = parsearRaton(typeof d === "string" ? d : d.toString())
      if (!ev) return
      if (ev.tipo === "rueda-abajo") setDesplazamiento((v) => v + 2)
      else if (ev.tipo === "rueda-arriba") setDesplazamiento((v) => Math.max(0, v - 2))
      else {
        const id = zonaDeClic(ev.y, zonas.current)
        if (id?.startsWith("menu:")) {
          setPanel(id.slice(5))
          setFoco("menu")
        }
      }
    }
    stdin.on("data", alDato)
    return () => {
      stdin.off("data", alDato)
    }
  }, [sinRaton, stdin, setRawMode])

  // ── Teclado ────────────────────────────────────────────────────────────────
  useInput((entrada, tecla) => {
    if (filtrando) {
      if (tecla.escape) {
        setFiltrando(false)
        setFiltro("")
      } else if (tecla.return) setFiltrando(false)
      return
    }
    if (confirmando) {
      if (tecla.escape) {
        setConfirmando(null)
        setTextoConfirma("")
      } else if (tecla.return) {
        const c = confirmando
        setConfirmando(null)
        correrComando(c, textoConfirma.trim())
        setTextoConfirma("")
      }
      return
    }
    if (entrada === "q" || (tecla.ctrl && entrada === "c")) {
      if (ejecucion?.estado === "corriendo") {
        cortar(ejecucion.id)
        return
      }
      cortarTodo()
      exit()
      return
    }
    if (entrada === "?") return setPanel("ayuda")
    if (entrada === "/") {
      setFiltrando(true)
      return
    }
    if (entrada === "r") {
      if (panel === "salud") {
        setBloques(null)
        void cargarSalud()
      }
      return
    }
    if (/^[1-9]$/.test(entrada)) {
      const o = OPCIONES[Number(entrada) - 1]
      if (o) setPanel(o.id)
      return
    }
    if (tecla.tab) {
      setFoco((f) => (f === "menu" ? "contenido" : "menu"))
      return
    }
    const abajo = tecla.downArrow || entrada === "j"
    const arriba = tecla.upArrow || entrada === "k"
    if (foco === "menu" && (abajo || arriba)) {
      const i = OPCIONES.findIndex((o) => o.id === panel)
      const n = (i + (abajo ? 1 : -1) + OPCIONES.length) % OPCIONES.length
      setPanel(OPCIONES[n].id)
      return
    }
    if (abajo) setSeleccion((s) => Math.min(Math.max(0, total - 1), s + 1))
    if (arriba) setSeleccion((s) => Math.max(0, s - 1))
    if (tecla.pageDown) setDesplazamiento((v) => v + 10)
    if (tecla.pageUp) setDesplazamiento((v) => Math.max(0, v - 10))
    if (tecla.return || tecla.rightArrow || entrada === "l") {
      if (foco === "menu") setFoco("contenido")
      else activar()
    }
    if (tecla.escape || tecla.leftArrow || entrada === "h") {
      if (ejecucion) setEjecucion(null)
      else setFoco("menu")
    }
  })

  const estadoProd = bloques?.find((b) => b.id === "produccion")?.estado ?? "apagado"
  const altoContenido = Math.max(6, alto - 14)

  return (
    <Box flexDirection="column" width={ancho}>
      <Logo version={version} estadoProduccion={estadoProd} ancho={ancho} />
      <Box>
        {anchoMenu ? (
          <Marco ancho={anchoMenu} separar>
            <Menu opciones={OPCIONES} activo={panel} enfocado={foco === "menu"} ancho={anchoMenu - 4} filaInicial={FILA_MENU} />
          </Marco>
        ) : null}
        <Marco
          crece
          titulo={OPCIONES.find((o) => o.id === panel)?.titulo.toUpperCase()}
          nota={filtrando ? undefined : panel === "salud" ? "r refrescar" : filtro ? `filtro: ${filtro}` : undefined}
        >
          {filtrando ? (
            <Box>
              <Text color={color(COLORES.lima)}>buscar: </Text>
              <TextInput value={filtro} onChange={setFiltro} onSubmit={() => setFiltrando(false)} />
            </Box>
          ) : null}

          {panel === "salud" ? (
            cargando && !bloques ? (
              <Box>
                <Text color={color(COLORES.lima)}>
                  <Spinner type="dots" />
                </Text>
                <Text color={color(COLORES.gris)}> revisando local, producción y el repositorio…</Text>
              </Box>
            ) : (
              <Box flexDirection="column">
                {bloques?.map((b, i) => (
                  <BloqueSalud key={b.id} bloque={b} ancho={anchoPanel} abierto={abierto === b.id} seleccionado={foco === "contenido" && seleccion === i} />
                ))}
                <Text color={color(COLORES.gris)}>⏎ abre o cierra un bloque · en VPS pregunta por SSH</Text>
              </Box>
            )
          ) : null}

          {panel === "comandos" ? (
            ejecucion ? (
              <Box flexDirection="column">
                <Box>
                  <Text bold color={color(COLORES.lima)}>
                    {ejecucion.comando.titulo}
                  </Text>
                  <Text color={color(COLORES.gris)}>
                    {"  "}
                    {ejecucion.comando.cmd} {ejecucion.comando.args.join(" ")}
                  </Text>
                </Box>
                <Box flexDirection="column" marginTop={1}>
                  {ejecucion.lineas.slice(-(altoContenido - 3)).map((l, i) => (
                    <Text key={i} color={l.err ? color(COLORES.amarillo) : color(COLORES.gris)}>
                      {l.texto.slice(0, anchoPanel)}
                    </Text>
                  ))}
                </Box>
                <Box marginTop={1}>
                  {ejecucion.estado === "corriendo" ? (
                    <Text color={color(COLORES.lima)}>
                      <Spinner type="dots" /> corriendo… (q o Ctrl-C lo corta)
                    </Text>
                  ) : (
                    <Text color={ejecucion.code === 0 ? color(COLORES.lima) : color(COLORES.rojo)}>
                      {ejecucion.estado === "cortado" ? "cortado" : ejecucion.code === 0 ? "✓ listo" : `✗ terminó con código ${ejecucion.code}`}
                      {ejecucion.fin ? ` en ${Math.round((ejecucion.fin - ejecucion.inicio) / 100) / 10}s` : ""} · Esc para volver
                    </Text>
                  )}
                </Box>
              </Box>
            ) : confirmando ? (
              <Box flexDirection="column">
                <Text bold color={color(COLORES.amarillo)}>
                  {confirmando.titulo}
                </Text>
                <Text color={color(COLORES.gris)}>{confirmando.advertencia}</Text>
                <Box marginTop={1}>
                  <Text>
                    Escribe <Text bold color={color(COLORES.lima)}>{confirmando.confirmacion}</Text> para seguir (Esc cancela):{" "}
                  </Text>
                  <TextInput
                    value={textoConfirma}
                    onChange={setTextoConfirma}
                    onSubmit={(v) => {
                      const c = confirmando
                      setConfirmando(null)
                      correrComando(c, v.trim())
                      setTextoConfirma("")
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                {aviso ? <Text color={color(COLORES.amarillo)}>{aviso}</Text> : null}
                {comandosFiltrados.map((c, i) => (
                  <Box key={c.id}>
                    <Text color={foco === "contenido" && seleccion === i ? color(COLORES.lima) : color(COLORES.blanco)} bold={seleccion === i}>
                      {(foco === "contenido" && seleccion === i ? "▸ " : "  ") + c.titulo.padEnd(30)}
                    </Text>
                    <Text color={c.riesgo === "alto" ? color(COLORES.amarillo) : color(COLORES.gris)}>
                      {c.riesgo === "alto" ? "⚠ " : "  "}
                      {c.detalle.slice(0, Math.max(10, anchoPanel - 36))}
                    </Text>
                  </Box>
                ))}
                <Box marginTop={1}>
                  <Text color={color(COLORES.gris)}>⏎ corre el seleccionado · ⚠ pide confirmación escrita</Text>
                </Box>
              </Box>
            )
          ) : null}

          {panel === "ayuda" ? <Ayuda ancho={anchoPanel} /> : null}

          {["stack", "infra", "arquitectura"].includes(panel) ? (
            <Lista filas={filas} ancho={anchoPanel} alto={altoContenido} desplazamiento={desplazamiento} seleccion={foco === "contenido" ? seleccion : undefined} />
          ) : null}
        </Marco>
      </Box>
      <Box paddingX={1}>
        <Text color={color(COLORES.gris)}>↑↓/jk mover · ⏎ entrar · Esc volver · Tab panel · / filtrar · r refrescar · ? ayuda · q salir</Text>
      </Box>
    </Box>
  )
}

function Ayuda({ ancho }: { ancho: number }) {
  const filas: [string, string][] = [
    ["↑ ↓ j k", "Mover la selección"],
    ["Tab", "Cambiar entre el menú y el contenido"],
    ["⏎ → l", "Entrar o activar"],
    ["Esc ← h", "Volver"],
    ["1 … 6", "Saltar a una sección"],
    ["/", "Filtrar lo que se ve (Esc limpia)"],
    ["r", "Refrescar la salud"],
    ["PgUp PgDn", "Desplazar el contenido"],
    ["ratón", "Clic en el menú, rueda para desplazar"],
    ["q Ctrl-C", "Salir (si hay un comando corriendo, primero lo corta)"],
  ]
  return (
    <Box flexDirection="column">
      <Text color={color(COLORES.gris)}>Esta consola lee el repositorio de verdad: las versiones, los servicios y los módulos salen de los archivos, no de un texto.</Text>
      <Box marginTop={1} flexDirection="column">
        {filas.map(([k, v]) => (
          <Box key={k}>
            <Text bold color={color(COLORES.lima)}>
              {k.padEnd(12)}
            </Text>
            <Text color={color(COLORES.gris)}>{v.slice(0, ancho - 14)}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={color(COLORES.gris)}>También: pnpm mirai salud --json (para scripts) y pnpm mirai --web (en el navegador).</Text>
      </Box>
    </Box>
  )
}
