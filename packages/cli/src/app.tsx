// La consola de Mirai en la terminal: cabecera, menú y panel, con teclado y ratón.
import { Box, Text, useApp, useInput, useStdin } from "ink"
import Spinner from "ink-spinner"
import TextInput from "ink-text-input"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AMBIENTES, apagarAmbiente, type EstadoAmbiente, estadoAmbientes, liberarPuerto, puertosQueEstorban } from "./datos/ambientes.ts"
import { buscar, type Hallazgo, resumenIndice } from "./datos/buscador.ts"
import { porQueFallo } from "./datos/despliegue.ts"
import { diff } from "./datos/git.ts"
import { type DatosPanel, panel as traerPanel, PANELES } from "./datos/index.ts"
import { cerrarRegistros, seguirRegistros, type Seguimiento } from "./datos/registros.ts"
import { type Comando, COMANDOS } from "./datos/comandos.ts"
import { cortar, cortarTodo, type Ejecucion, lanzar } from "./datos/ejecucion.ts"
import { infraestructura } from "./datos/infra.ts"
import { arquitectura } from "./datos/modulos.ts"
import { identidad, monorepo, stack } from "./datos/repo.ts"
import { saludLocal } from "./datos/salud-local.ts"
import { DOMINIO_POR_DEFECTO, saludProduccion } from "./datos/salud-prod.ts"
import { saludRepo } from "./datos/salud-repo.ts"
import { bloqueApagado, saludVps } from "./datos/salud-vps.ts"
import type { Bloque, Fila as FilaDato, Seccion } from "./datos/tipos.ts"
import { parsearRaton, prenderRaton, zonaDeClic, type Zona } from "./raton.ts"
import { TarjetaAmbiente } from "./ui/ambiente.tsx"
import { PanelBase, PanelBuscador, PanelDespliegue, PanelEndpoints, PanelGit, PanelPruebas, PanelRecursos, PanelRegistros, Texto } from "./ui/paneles.tsx"
import { BloqueSalud } from "./ui/bloque-salud.tsx"
import { Lista } from "./ui/lista.tsx"
import { Cabecera } from "./ui/logo.tsx"
import { Fila, Grupo, Panel } from "./ui/marco.tsx"
import { Menu, type Opcion } from "./ui/menu.tsx"
import { C, c, columna, recortar, semaforo } from "./ui/tema.ts"

/** El menú sale de PANELES (la misma lista que usa la web) más los dos propios de la terminal. */
const SECCIONES: { id: string; titulo: string }[] = [
  ...PANELES.map((p) => ({ id: p.id as string, titulo: p.titulo })),
  { id: "buscador", titulo: "Buscar" },
  { id: "ayuda", titulo: "Ayuda" },
]

/** Los paneles que traen sus datos de la API del motor (y por eso se cargan al entrar). */
const CON_DATOS = new Set(["registros", "recursos", "base", "pruebas", "git", "despliegue", "endpoints"])

/** Fila de la terminal donde empieza el menú (cabecera + logo). El ratón la necesita. */
const FILA_MENU = 7

type Props = { inicial?: string; dominio?: string; sinRaton?: boolean }

export function App({ inicial = "ambientes", dominio = DOMINIO_POR_DEFECTO, sinRaton }: Props) {
  const { exit } = useApp()
  const { stdin, setRawMode } = useStdin()
  const [tam, setTam] = useState(() => ({ cols: process.stdout.columns ?? 100, rows: process.stdout.rows ?? 30 }))
  useEffect(() => {
    const alCambiar = () => setTam({ cols: process.stdout.columns ?? 100, rows: process.stdout.rows ?? 30 })
    process.stdout.on("resize", alCambiar)
    return () => {
      process.stdout.off("resize", alCambiar)
    }
  }, [])
  const ancho = Math.max(60, tam.cols)
  const alto = Math.max(18, tam.rows)
  const anchoMenu = ancho >= 88 ? 25 : 0
  // El menú deja 1 columna de separación; el panel se queda con todo lo demás.
  const anchoDerecho = ancho - (anchoMenu ? anchoMenu + 1 : 0)
  const anchoPanel = anchoDerecho - 4 // dos bordes y dos de relleno
  const altoContenido = Math.max(6, alto - (ancho >= 76 ? 12 : 8))

  const [panel, setPanel] = useState(inicial)
  const [foco, setFoco] = useState<"menu" | "contenido">("contenido")
  const [seleccion, setSeleccion] = useState(0)
  const [desplazamiento, setDesplazamiento] = useState(0)
  const [filtro, setFiltro] = useState("")
  const [filtrando, setFiltrando] = useState(false)
  const [version] = useState(() => identidad().version)

  const [ambientes, setAmbientes] = useState<EstadoAmbiente[] | null>(null)
  const [bloques, setBloques] = useState<Bloque[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const [ejecucion, setEjecucion] = useState<Ejecucion | null>(null)
  const [, forzar] = useState(0)
  const [confirmando, setConfirmando] = useState<Comando | null>(null)
  const [textoConfirma, setTextoConfirma] = useState("")
  const [estorbo, setEstorbo] = useState<{ id: string; puertos: number[] } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Paneles que traen datos del motor (registros, recursos, base, pruebas, git, despliegue, endpoints).
  const [datos, setDatos] = useState<DatosPanel | null>(null)
  const [cargandoPanel, setCargandoPanel] = useState(false)
  // Una vista de detalle dentro de un panel: registros en vivo, un diff, el log del CI.
  const [detalle, setDetalle] = useState<{ titulo: string; lineas: string[]; colorear?: boolean } | null>(null)
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null)
  const [consulta, setConsulta] = useState("")

  const secciones: Seccion[] = useMemo(() => {
    if (panel === "stack") return [stack(), monorepo()]
    if (panel === "infra") return infraestructura()
    if (panel === "arquitectura") return arquitectura()
    return []
  }, [panel])

  const filas: FilaDato[] = useMemo(() => {
    const todas = secciones.flatMap((s) => s.filas.map((f) => ({ ...f, grupo: f.grupo ?? s.titulo })))
    if (!filtro) return todas
    const q = filtro.toLowerCase()
    return todas.filter((f) => `${f.nombre} ${f.valor ?? ""} ${f.detalle}`.toLowerCase().includes(q))
  }, [secciones, filtro])

  const comandosFiltrados = useMemo(() => {
    if (!filtro) return COMANDOS
    const q = filtro.toLowerCase()
    return COMANDOS.filter((x) => `${x.titulo} ${x.detalle}`.toLowerCase().includes(q))
  }, [filtro])

  const hallazgos: Hallazgo[] = useMemo(() => (panel === "buscador" ? buscar(consulta) : []), [panel, consulta])

  const endpointsFiltrados = useMemo(() => {
    const todos = datos?.endpoints ?? []
    if (!filtro) return todos
    const q = filtro.toLowerCase()
    return todos.filter((e) => `${e.metodo} ${e.ruta} ${e.resumen} ${e.modulo}`.toLowerCase().includes(q))
  }, [datos, filtro])

  /** Los archivos cambiados en una sola lista, para que la selección camine derecho. */
  const archivosGit = useMemo(() => (datos?.git?.grupos ?? []).flatMap((g) => g.cambios), [datos])

  const cargarAmbientes = useCallback(async () => {
    setAmbientes(await estadoAmbientes())
  }, [])

  const cargarSalud = useCallback(async () => {
    setCargando(true)
    const [local, prod, repo] = await Promise.all([saludLocal(), saludProduccion(dominio), saludRepo()])
    setBloques([local, prod, repo, bloqueApagado()])
    setCargando(false)
  }, [dominio])

  useEffect(() => {
    if (panel === "ambientes" && !ambientes) void cargarAmbientes()
    if (panel === "salud" && !bloques && !cargando) void cargarSalud()
  }, [panel, ambientes, bloques, cargando, cargarAmbientes, cargarSalud])

  const cargarPanel = useCallback(async (id: string) => {
    if (!CON_DATOS.has(id)) return
    setCargandoPanel(true)
    try {
      setDatos(await traerPanel(id as Parameters<typeof traerPanel>[0], dominio))
    } finally {
      setCargandoPanel(false)
    }
  }, [dominio])

  useEffect(() => {
    if (CON_DATOS.has(panel) && !datos && !cargandoPanel) void cargarPanel(panel)
  }, [panel, datos, cargandoPanel, cargarPanel])

  useEffect(() => {
    setSeleccion(0)
    setDesplazamiento(0)
    setFiltro("")
    setFiltrando(false)
    setEstorbo(null)
    setAviso(null)
    setDatos(null)
    setDetalle(null)
    // Un seguimiento de registros abierto se cierra: si no, sigue leyendo docker para siempre.
    setSeguimiento((s) => {
      s?.cerrar()
      return null
    })
  }, [panel])

  // Mientras un ambiente arranca, se vuelve a mirar cada 4 segundos para que el estado no quede viejo.
  useEffect(() => {
    if (panel !== "ambientes") return
    const reloj = setInterval(() => void cargarAmbientes(), 4000)
    return () => clearInterval(reloj)
  }, [panel, cargarAmbientes])

  const correrComando = useCallback((x: Comando, confirmacion?: string) => {
    const r = lanzar(x.id, confirmacion)
    if (!r.ok) return setAviso(r.msg)
    setEjecucion(r.ejecucion)
    setAviso(null)
    r.ejecucion.eventos.on("linea", () => forzar((n) => n + 1))
    r.ejecucion.eventos.on("fin", () => {
      forzar((n) => n + 1)
      void cargarAmbientes()
    })
  }, [cargarAmbientes])

  /** Levantar un ambiente: antes mira si hay un puerto trancado y ofrece liberarlo. */
  const levantar = useCallback(
    async (it: EstadoAmbiente) => {
      const estorban = await puertosQueEstorban(it.ambiente.id)
      if (estorban.length) return setEstorbo({ id: it.ambiente.id, puertos: estorban })
      const cmd = COMANDOS.find((x) => x.id === `prender-${it.ambiente.id}`)
      if (cmd) correrComando(cmd)
    },
    [correrComando],
  )

  /** Apagar de verdad: cierra lo que tenga los puertos tomados y baja los contenedores si los hay. */
  const apagar = useCallback(
    (it: EstadoAmbiente) => {
      setAviso(`Apagando ${it.ambiente.titulo}…`)
      void apagarAmbiente(it.ambiente.id).then(async (r) => {
        setAviso(r.msg)
        await cargarAmbientes()
      })
    },
    [cargarAmbientes],
  )

  const activar = useCallback(() => {
    if (panel === "ambientes" && ambientes) {
      const it = ambientes[seleccion]
      if (!it) return
      if (it.estado === "apagado") void levantar(it)
      else apagar(it)
      return
    }
    if (panel === "salud" && bloques) {
      const b = bloques[seleccion]
      if (!b) return
      if (b.id === "vps") {
        setBloques((v) => v?.map((x) => (x.id === "vps" ? { ...x, chequeos: [{ id: "x", titulo: "Preguntando", estado: "apagado", detalle: "abriendo sesión SSH…" }] } : x)) ?? null)
        void saludVps().then((vps) => setBloques((v) => v?.map((x) => (x.id === "vps" ? vps : x)) ?? null))
      } else setAbierto((a) => (a === b.id ? null : b.id))
      return
    }
    if (panel === "comandos") {
      const x = comandosFiltrados[seleccion]
      if (!x) return
      if (x.riesgo === "alto") {
        setConfirmando(x)
        setTextoConfirma("")
      } else correrComando(x)
      return
    }
    if (panel === "pruebas") {
      const sx = datos?.pruebas?.suites[seleccion]
      const cmd = sx ? COMANDOS.find((x) => x.id === `prueba-${sx.id}`) : undefined
      if (cmd) correrComando(cmd)
      return
    }
    if (panel === "registros") {
      const cont = datos?.contenedores?.[seleccion]
      if (!cont?.arriba) return setAviso("Ese contenedor no está corriendo.")
      const seg = seguirRegistros(cont.nombre)
      setSeguimiento(seg)
      setDetalle({ titulo: `Registros · ${cont.servicio}`, lineas: [] })
      seg.eventos.on("linea", () => forzar((n) => n + 1))
      return
    }
    if (panel === "git") {
      const a = archivosGit[seleccion]
      if (!a) return
      setDetalle({ titulo: a.ruta, lineas: ["Leyendo el diff…"], colorear: true })
      void diff(a.ruta).then((lineas) => setDetalle({ titulo: a.ruta, lineas, colorear: true }))
      return
    }
    if (panel === "despliegue") {
      const cx = datos?.despliegue?.corridas[seleccion]
      if (!cx) return
      if (cx.estado !== "error") return setAviso(`Esa corrida ${cx.resultado}. Solo las que fallaron tienen registro.`)
      setDetalle({ titulo: `Por qué falló · ${cx.nombre}`, lineas: ["Pidiéndole el registro a GitHub…"], colorear: true })
      void porQueFallo(cx.id).then((lineas) => setDetalle({ titulo: `Por qué falló · ${cx.nombre}`, lineas, colorear: true }))
      return
    }
    if (panel === "buscador") {
      const h = hallazgos[seleccion]
      if (h) setPanel(h.panel)
      return
    }
  }, [panel, ambientes, bloques, seleccion, comandosFiltrados, levantar, apagar, correrComando, datos, archivosGit, hallazgos])

  const total = (() => {
    if (detalle) return 0
    switch (panel) {
      case "ambientes": return ambientes?.length ?? 0
      case "salud": return bloques?.length ?? 0
      case "comandos": return comandosFiltrados.length
      case "registros": return datos?.contenedores?.length ?? 0
      case "base": return datos?.base?.tablas.length ?? 0
      case "pruebas": return datos?.pruebas?.suites.length ?? 0
      case "git": return archivosGit.length
      case "despliegue": return datos?.despliegue?.corridas.length ?? 0
      case "endpoints": return endpointsFiltrados.length
      case "buscador": return hallazgos.length
      default: return filas.length
    }
  })()

  // ── Ratón ──────────────────────────────────────────────────────────────────
  const zonas = useRef<Zona[]>([])
  zonas.current = anchoMenu ? SECCIONES.map((o, i) => ({ id: `menu:${o.id}`, fila: FILA_MENU + i })) : []
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
          setFoco("contenido")
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
      }
      return
    }
    if (estorbo) {
      if (tecla.escape || entrada === "n") return setEstorbo(null)
      if (entrada === "s" || tecla.return) {
        const { id, puertos } = estorbo
        setEstorbo(null)
        setAviso("Liberando puertos…")
        void (async () => {
          const r = await Promise.all(puertos.map(liberarPuerto))
          setAviso(r.map((x) => x.msg).join(" "))
          await cargarAmbientes()
          if (r.every((x) => x.ok)) {
            const cmd = COMANDOS.find((x) => x.id === `prender-${id}`)
            if (cmd) correrComando(cmd)
          }
        })()
      }
      return
    }
    if (entrada === "q" || (tecla.ctrl && entrada === "c")) {
      if (ejecucion?.estado === "corriendo") return void cortar(ejecucion.id)
      cortarTodo()
      cerrarRegistros()
      exit()
      return
    }
    if (entrada === "?") return setPanel("ayuda")
    if (entrada === "/") return setFiltrando(true)
    if (entrada === "r") {
      if (panel === "salud") {
        setBloques(null)
        void cargarSalud()
      }
      if (panel === "ambientes") void cargarAmbientes()
      if (CON_DATOS.has(panel)) void cargarPanel(panel)
      return
    }
    if (entrada === "b") return setPanel("buscador")
    if (/^[1-9]$/.test(entrada)) {
      const o = SECCIONES[Number(entrada) - 1]
      if (o) setPanel(o.id)
      return
    }
    if (tecla.tab) return setFoco((f) => (f === "menu" ? "contenido" : "menu"))
    const abajo = tecla.downArrow || entrada === "j"
    const arriba = tecla.upArrow || entrada === "k"
    if (foco === "menu" && (abajo || arriba)) {
      const i = SECCIONES.findIndex((o) => o.id === panel)
      setPanel(SECCIONES[(i + (abajo ? 1 : -1) + SECCIONES.length) % SECCIONES.length].id)
      return
    }
    if (abajo) setSeleccion((s) => Math.min(Math.max(0, total - 1), s + 1))
    if (arriba) setSeleccion((s) => Math.max(0, s - 1))
    if (tecla.pageDown) setDesplazamiento((v) => v + 10)
    if (tecla.pageUp) setDesplazamiento((v) => Math.max(0, v - 10))
    // En Ambientes: l levanta, a apaga, sin importar en qué estado esté.
    if (panel === "ambientes" && ambientes) {
      const it = ambientes[seleccion]
      if (it && entrada === "l") return void levantar(it)
      if (it && entrada === "a") return apagar(it)
    }
    if (tecla.return || tecla.rightArrow) {
      if (foco === "menu") setFoco("contenido")
      else activar()
    }
    if (tecla.escape || tecla.leftArrow || entrada === "h") {
      if (detalle) {
        seguimiento?.cerrar()
        setSeguimiento(null)
        setDetalle(null)
      } else if (ejecucion) setEjecucion(null)
      else setFoco("menu")
    }
  })

  const estadoProd = bloques?.find((b) => b.id === "produccion")?.estado ?? "apagado"
  const opciones: Opcion[] = SECCIONES.map((o) => {
    if (o.id === "ambientes" && ambientes) {
      const arriba = ambientes.filter((a) => a.estado !== "apagado").length
      return { ...o, marca: arriba ? { punto: "●", color: c(C.ok) } : { punto: "○", color: c(C.apagado) } }
    }
    if (o.id === "salud" && bloques) {
      const s = semaforo(bloques.some((b) => b.estado === "error") ? "error" : bloques.some((b) => b.estado === "aviso") ? "aviso" : "ok")
      return { ...o, marca: { punto: s.punto, color: s.color } }
    }
    return o
  })

  const titulo = SECCIONES.find((o) => o.id === panel)?.titulo.toUpperCase() ?? ""
  const nota = filtrando ? undefined : filtro ? `/${filtro}` : panel === "salud" || panel === "ambientes" ? "r refrescar" : undefined

  return (
    <Box flexDirection="column" width={ancho}>
      <Cabecera version={version} estadoProduccion={estadoProd} ancho={ancho} />
      <Box>
        {anchoMenu ? (
          <Panel ancho={anchoMenu} separar activo={foco === "menu"} titulo="MENÚ">
            <Menu opciones={opciones} activo={panel} enfocado={foco === "menu"} ancho={anchoMenu - 4} />
          </Panel>
        ) : null}
        <Panel titulo={titulo} nota={nota} ancho={anchoDerecho} activo={foco === "contenido"}>
          {panel === "buscador" ? (
            <Box marginBottom={1}>
              <Text color={c(C.lima)}>buscar ▸ </Text>
              <TextInput value={consulta} onChange={setConsulta} onSubmit={() => setFoco("contenido")} focus={!filtrando} />
            </Box>
          ) : filtrando ? (
            <Box marginBottom={1}>
              <Text color={c(C.lima)}>filtrar ▸ </Text>
              <TextInput value={filtro} onChange={setFiltro} onSubmit={() => setFiltrando(false)} />
            </Box>
          ) : null}
          {aviso ? (
            <Box marginBottom={1}>
              <Text color={c(C.aviso)}>▲ {recortar(aviso, anchoPanel - 4)}</Text>
            </Box>
          ) : null}

          {panel === "ambientes" ? (
            estorbo ? (
              <PuertoTrancado puertos={estorbo.puertos} />
            ) : ejecucion ? (
              <Salida ejecucion={ejecucion} ancho={anchoPanel} alto={altoContenido} />
            ) : !ambientes ? (
              <Cargando texto="mirando qué está corriendo…" />
            ) : (
              <Box flexDirection="column">
                {ambientes.map((it, i) => (
                  <TarjetaAmbiente key={it.ambiente.id} it={it} ancho={anchoPanel} seleccionado={foco === "contenido" && seleccion === i} />
                ))}
                <Text color={c(C.tenue)}>⏎ levantar o apagar · l levantar · a apagar · r refrescar</Text>
              </Box>
            )
          ) : null}

          {panel === "salud" ? (
            cargando && !bloques ? (
              <Cargando texto="revisando local, producción y el repositorio…" />
            ) : (
              <Box flexDirection="column">
                {bloques?.map((b, i) => (
                  <BloqueSalud key={b.id} bloque={b} ancho={anchoPanel} abierto={abierto === b.id} seleccionado={foco === "contenido" && seleccion === i} />
                ))}
                <Box marginTop={1}>
                  <Text color={c(C.tenue)}>⏎ abre un bloque · en VPS pregunta por SSH · r refrescar</Text>
                </Box>
              </Box>
            )
          ) : null}

          {panel === "comandos" ? (
            ejecucion ? (
              <Salida ejecucion={ejecucion} ancho={anchoPanel} alto={altoContenido} />
            ) : confirmando ? (
              <Confirmar
                comando={confirmando}
                valor={textoConfirma}
                onChange={setTextoConfirma}
                onSubmit={(v) => {
                  const x = confirmando
                  setConfirmando(null)
                  correrComando(x, v.trim())
                  setTextoConfirma("")
                }}
              />
            ) : (
              <ListaComandos comandos={comandosFiltrados} ancho={anchoPanel} seleccion={foco === "contenido" ? seleccion : -1} alto={altoContenido} />
            )
          ) : null}

          {detalle ? (
            <Box flexDirection="column">
              <Text bold color={c(C.lima)}>
                {recortar(detalle.titulo, anchoPanel)}
              </Text>
              <Box marginTop={1}>
                <Texto lineas={detalle.lineas.length ? detalle.lineas : (seguimiento?.lineas.map((l) => l.texto) ?? ["esperando…"])} ancho={anchoPanel} alto={altoContenido - 3} colorear={detalle.colorear} />
              </Box>
              <Box marginTop={1}>
                <Text color={c(C.tenue)}>{seguimiento ? "en vivo · Esc para volver" : "Esc para volver"}</Text>
              </Box>
            </Box>
          ) : null}

          {!detalle && CON_DATOS.has(panel) && cargandoPanel && !datos ? <Cargando texto="consultando…" /> : null}

          {!detalle && datos ? (
            <Box flexDirection="column">
              {panel === "registros" && datos.contenedores ? <PanelRegistros lista={datos.contenedores} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} /> : null}
              {panel === "recursos" && datos.uso ? <PanelRecursos uso={datos.uso} disco={datos.disco ?? null} docker={datos.discoDocker ?? []} ancho={anchoPanel} /> : null}
              {panel === "base" && datos.base ? (
                <PanelBase estado={datos.base.estado} tablas={datos.base.tablas} error={datos.base.error} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} />
              ) : null}
              {panel === "pruebas" && datos.pruebas ? (
                <PanelPruebas suites={datos.pruebas.suites} capturas={datos.pruebas.capturas} ultima={datos.pruebas.ultima} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} />
              ) : null}
              {panel === "git" && datos.git ? (
                <PanelGit grupos={datos.git.grupos} commits={datos.git.commits} situacion={datos.git.situacion} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} />
              ) : null}
              {panel === "despliegue" && datos.despliegue ? (
                <PanelDespliegue corridas={datos.despliegue.corridas} msg={datos.despliegue.msg} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} />
              ) : null}
              {panel === "endpoints" && datos.endpoints ? (
                <PanelEndpoints lista={endpointsFiltrados} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} alto={altoContenido} desde={desplazamiento} />
              ) : null}
            </Box>
          ) : null}

          {panel === "buscador" ? (
            <PanelBuscador hallazgos={hallazgos} consulta={consulta} seleccion={foco === "contenido" ? seleccion : -1} ancho={anchoPanel} resumen={resumenIndice()} />
          ) : null}

          {panel === "ayuda" ? <Ayuda ancho={anchoPanel} /> : null}

          {!detalle && ["stack", "infra", "arquitectura"].includes(panel) ? (
            <Lista filas={filas} ancho={anchoPanel} alto={altoContenido} desplazamiento={desplazamiento} seleccion={foco === "contenido" ? seleccion : undefined} />
          ) : null}
        </Panel>
      </Box>
      <Box paddingX={1}>
        <Text color={c(C.tenue)}>↑↓ mover · ⏎ activar · Tab panel · b buscar · / filtrar · r refrescar · ? ayuda · q salir</Text>
      </Box>
    </Box>
  )
}

const Cargando = ({ texto }: { texto: string }) => (
  <Box>
    <Text color={c(C.lima)}>
      <Spinner type="dots" />
    </Text>
    <Text color={c(C.suave)}> {texto}</Text>
  </Box>
)

export function PuertoTrancado({ puertos }: { puertos: number[] }) {
  return (
    <Box flexDirection="column">
      <Text bold color={c(C.aviso)}>
        ▲ {puertos.length === 1 ? `El puerto ${puertos[0]} está ocupado` : `Los puertos ${puertos.join(", ")} están ocupados`}
      </Text>
      <Box marginTop={1}>
        <Text color={c(C.suave)}>Seguramente quedó una corrida anterior abierta. Puedo cerrarla y levantar el ambiente.</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={c(C.lima)}>s</Text>
        <Text color={c(C.suave)}> cerrar lo que estorba y levantar · </Text>
        <Text color={c(C.lima)}>n</Text>
        <Text color={c(C.suave)}> cancelar</Text>
      </Box>
    </Box>
  )
}

function Salida({ ejecucion, ancho, alto }: { ejecucion: Ejecucion; ancho: number; alto: number }) {
  const segundos = ((ejecucion.fin ?? Date.now()) - ejecucion.inicio) / 1000
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={c(C.lima)}>
          {ejecucion.comando.titulo}
        </Text>
        <Text color={c(C.tenue)}>
          {"  "}
          {ejecucion.comando.cmd} {ejecucion.comando.args.join(" ")}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {ejecucion.lineas.slice(-(alto - 3)).map((l, i) => (
          <Text key={i} color={c(l.err ? C.suave : C.tenue)}>
            {recortar(l.texto, ancho)}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        {ejecucion.estado === "corriendo" ? (
          <Text color={c(C.lima)}>
            <Spinner type="dots" /> corriendo hace {segundos.toFixed(0)}s · q lo corta
          </Text>
        ) : (
          <Text color={c(ejecucion.estado === "cortado" ? C.aviso : ejecucion.code === 0 ? C.ok : C.error)}>
            {ejecucion.estado === "cortado" ? "■ cortado" : ejecucion.code === 0 ? `● listo en ${segundos.toFixed(1)}s` : `■ terminó con código ${ejecucion.code}`} · Esc para volver
          </Text>
        )}
      </Box>
    </Box>
  )
}

function Confirmar({ comando, valor, onChange, onSubmit }: { comando: Comando; valor: string; onChange: (v: string) => void; onSubmit: (v: string) => void }) {
  return (
    <Box flexDirection="column">
      <Text bold color={c(C.error)}>
        ■ {comando.titulo}
      </Text>
      <Box marginTop={1}>
        <Text color={c(C.suave)}>{comando.advertencia}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={c(C.suave)}>Escribe </Text>
        <Text bold color={c(C.lima)}>
          {comando.confirmacion}
        </Text>
        <Text color={c(C.suave)}> para seguir (Esc cancela) ▸ </Text>
        <TextInput value={valor} onChange={onChange} onSubmit={onSubmit} />
      </Box>
    </Box>
  )
}

function ListaComandos({ comandos, ancho, seleccion, alto }: { comandos: Comando[]; ancho: number; seleccion: number; alto: number }) {
  const grupos = [...new Set(comandos.map((x) => x.grupo))]
  let i = -1
  let pintadas = 0
  return (
    <Box flexDirection="column">
      {grupos.map((g) => (
        <Box key={g} flexDirection="column">
          <Grupo texto={g} ancho={ancho} />
          {comandos
            .filter((x) => x.grupo === g)
            .map((x) => {
              i += 1
              if (++pintadas > alto) return null
              return (
                <Fila
                  key={x.id}
                  nombre={x.titulo}
                  valor={x.riesgo === "alto" ? "⚠ confirma" : ""}
                  detalle={x.detalle}
                  anchos={(() => {
                    const n = Math.min(38, Math.max(24, Math.floor(ancho * 0.42)))
                    return [n, 12, Math.max(0, ancho - n - 15)]
                  })()}
                  resaltada={seleccion === i}
                  colorValor={x.riesgo === "alto" ? c(C.aviso) : undefined}
                />
              )
            })}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={c(C.tenue)}>⏎ corre el seleccionado</Text>
      </Box>
    </Box>
  )
}

function Ayuda({ ancho }: { ancho: number }) {
  const atajos: [string, string][] = [
    ["↑ ↓  j k", "Mover la selección"],
    ["Tab", "Cambiar entre el menú y el contenido"],
    ["⏎  →", "Entrar o activar"],
    ["Esc  ←", "Volver"],
    ["1 … 9", "Saltar a una sección"],
    ["l  ·  a", "En Ambientes: levantar · apagar"],
    ["s", "Cerrar lo que tranca un puerto y seguir"],
    ["b", "Buscador global: módulos, endpoints, tablas, secciones…"],
    ["/", "Filtrar lo que se ve (Esc limpia)"],
    ["r", "Volver a revisar"],
    ["PgUp PgDn", "Desplazar"],
    ["ratón", "Clic en el menú, rueda para desplazar"],
    ["q  Ctrl-C", "Salir (si algo está corriendo, primero lo corta)"],
  ]
  return (
    <Box flexDirection="column">
      <Text color={c(C.suave)}>{recortar("Todo lo que ves sale del repositorio: versiones, servicios y módulos se leen de los", ancho)}</Text>
      <Text color={c(C.suave)}>{recortar("archivos de verdad, no de un texto que se desactualiza.", ancho)}</Text>
      <Grupo texto="Atajos" ancho={ancho} />
      {atajos.map(([k, v]) => (
        <Box key={k}>
          <Text bold color={c(C.lima)}>
            {"  "}
            {columna(k, 12)}
          </Text>
          <Text color={c(C.suave)}>{recortar(v, ancho - 16)}</Text>
        </Box>
      ))}
      <Grupo texto="Desde la terminal" ancho={ancho} />
      {[
        ["pnpm mirai --web", "la misma consola en el navegador"],
        ["pnpm mirai salud --json", "para scripts (código 2 si algo está mal)"],
        ["pnpm mirai ambientes", "entra directo a un panel"],
      ].map(([k, v]) => (
        <Box key={k}>
          <Text color={c(C.texto)}>
            {"  "}
            {columna(k, 26)}
          </Text>
          <Text color={c(C.tenue)}>{recortar(v, ancho - 30)}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={c(C.tenue)}>  Ambientes: {AMBIENTES.map((a) => a.titulo).join(" · ")}</Text>
      </Box>
    </Box>
  )
}
