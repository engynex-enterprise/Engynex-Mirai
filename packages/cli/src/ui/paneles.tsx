// Cómo se pintan en la terminal los paneles que no son una lista simple: recursos, registros,
// base de datos, pruebas, cambios, despliegue, endpoints y el buscador global.
import { Box, Text } from "ink"
import type { Contenedor } from "../datos/registros.ts"
import type { Disco, Uso } from "../datos/recursos.ts"
import type { Tabla } from "../datos/base.ts"
import type { Corrida } from "../datos/despliegue.ts"
import type { Endpoint } from "../datos/endpoints.ts"
import type { Commit, GrupoCambios } from "../datos/git.ts"
import type { Captura, Suite } from "../datos/pruebas.ts"
import type { Hallazgo } from "../datos/buscador.ts"
import { barra, C, c, colorDeCarga, columna, recortar, semaforo } from "./tema.ts"
import { Grupo } from "./marco.tsx"

const sel = (activo: boolean) => (activo ? "▌ " : "  ")

/** Una línea con su medidor: ███████░░░░ 42% */
function Medidor({ fraccion, etiqueta, ancho = 14 }: { fraccion: number; etiqueta: string; ancho?: number }) {
  return (
    <Box>
      <Text color={colorDeCarga(fraccion)}>{barra(Math.min(1, fraccion), ancho)}</Text>
      <Text color={c(C.suave)}> {etiqueta}</Text>
    </Box>
  )
}

export function PanelRecursos({ uso, disco, docker, ancho }: { uso: Uso[]; disco: Disco | null; docker: { titulo: string; tamano: string; recuperable: string }[]; ancho: number }) {
  return (
    <Box flexDirection="column">
      {disco ? (
        <Box>
          <Text color={c(C.texto)}>{columna("Disco del equipo", 24)}</Text>
          <Medidor fraccion={disco.fraccion} etiqueta={`${disco.usado} de ${disco.total} · ${disco.libre} libres`} />
        </Box>
      ) : null}
      <Grupo texto="Contenedores" ancho={ancho} />
      {uso.length === 0 ? <Text color={c(C.tenue)}>  Ninguno corriendo.</Text> : null}
      {uso.map((u) => (
        <Box key={u.nombre}>
          <Text color={c(C.texto)}>{"  " + columna(u.nombre.replace(/^mirai-/, ""), 24)}</Text>
          <Medidor fraccion={Math.min(1, u.cpu)} etiqueta={columna(`${Math.round(u.cpu * 100)}% cpu`, 10)} ancho={10} />
          <Text> </Text>
          <Medidor fraccion={u.memoriaFraccion} etiqueta={`${Math.round(u.memoria)} MB`} ancho={10} />
        </Box>
      ))}
      {docker.length ? <Grupo texto="Lo que ocupa Docker" ancho={ancho} /> : null}
      {docker.map((d) => (
        <Box key={d.titulo}>
          <Text color={c(C.texto)}>{"  " + columna(d.titulo, 26)}</Text>
          <Text color={c(C.suave)}>{columna(d.tamano, 12)}</Text>
          <Text color={c(C.tenue)}>{d.recuperable} se pueden liberar</Text>
        </Box>
      ))}
    </Box>
  )
}

export function PanelRegistros({ lista, seleccion, ancho }: { lista: Contenedor[]; seleccion: number; ancho: number }) {
  let grupo = ""
  return (
    <Box flexDirection="column">
      {lista.length === 0 ? <Text color={c(C.tenue)}>No hay contenedores de Mirai. Levanta un ambiente primero.</Text> : null}
      {lista.map((x, i) => {
        const nuevo = x.proyecto !== grupo
        grupo = x.proyecto
        const s = semaforo(x.arriba ? "ok" : "apagado")
        return (
          <Box key={x.nombre} flexDirection="column">
            {nuevo ? <Grupo texto={x.proyecto} ancho={ancho} /> : null}
            <Box>
              <Text color={c(seleccion === i ? C.lima : C.borde)}>{sel(seleccion === i)}</Text>
              <Text color={s.color}>{s.punto} </Text>
              <Text color={c(seleccion === i ? C.lima : C.texto)} bold={seleccion === i}>
                {columna(x.servicio, 16)}
              </Text>
              <Text color={c(C.tenue)}>{recortar(x.detalle || x.imagen, Math.max(10, ancho - 34))}</Text>
            </Box>
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text color={c(C.tenue)}>⏎ ver sus registros en vivo</Text>
      </Box>
    </Box>
  )
}

export function PanelBase({ estado, tablas, seleccion, ancho, error }: { estado: { estado: "ok" | "aviso" | "error" | "apagado"; detalle: string }; tablas: Tabla[]; seleccion: number; ancho: number; error?: string }) {
  const s = semaforo(estado.estado)
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={s.color}>{s.punto} </Text>
        <Text color={c(C.texto)}>Base local · </Text>
        <Text color={c(C.suave)}>{estado.detalle}</Text>
      </Box>
      {error ? <Text color={c(C.aviso)}>▲ {recortar(error, ancho - 4)}</Text> : null}
      {tablas.length ? <Grupo texto={`${tablas.length} tablas`} ancho={ancho} /> : null}
      {tablas.map((t, i) => (
        <Box key={t.nombre}>
          <Text color={c(seleccion === i ? C.lima : C.borde)}>{sel(seleccion === i)}</Text>
          <Text color={c(seleccion === i ? C.lima : C.texto)} bold={seleccion === i}>
            {columna(t.nombre, 30)}
          </Text>
          <Text color={c(C.suave)}>{columna(`${t.filas.toLocaleString("es-CO")} filas`, 14)}</Text>
          <Text color={c(C.tenue)}>{columna(t.tamano, 10)}</Text>
          <Text color={c(t.rls ? C.ok : C.aviso)}>{t.rls ? "RLS" : "sin RLS"}</Text>
        </Box>
      ))}
    </Box>
  )
}

export function PanelPruebas({ suites, capturas, ultima, seleccion, ancho }: { suites: Suite[]; capturas: Captura[]; ultima: string | null; seleccion: number; ancho: number }) {
  return (
    <Box flexDirection="column">
      {suites.map((s, i) => (
        <Box key={s.id} flexDirection="column">
          <Box>
            <Text color={c(seleccion === i ? C.lima : C.borde)}>{sel(seleccion === i)}</Text>
            <Text color={c(seleccion === i ? C.lima : C.texto)} bold={seleccion === i}>
              {columna(s.titulo, 24)}
            </Text>
            <Text color={c(C.tenue)}>{recortar(s.detalle, Math.max(10, ancho - 44))}</Text>
            <Text color={c(C.borde)}> {s.tarda}</Text>
          </Box>
        </Box>
      ))}
      <Grupo texto="Capturas de la última batería" ancho={ancho} />
      <Text color={c(C.tenue)}>
        {"  "}
        {capturas.length ? `${capturas.length} imágenes${ultima ? ` · ${ultima}` : ""}` : "Todavía no hay capturas."}
      </Text>
      {capturas.length ? <Text color={c(C.borde)}>{"  "}Se ven en pnpm mirai --web › Pruebas, o en apps/web/tests/.out</Text> : null}
      <Box marginTop={1}>
        <Text color={c(C.tenue)}>⏎ corre la batería seleccionada</Text>
      </Box>
    </Box>
  )
}

export function PanelGit({ grupos, commits, situacion, seleccion, ancho }: { grupos: GrupoCambios[]; commits: Commit[]; situacion: { rama: string; sinSubir: number; sinBajar: number; sinGuardar: number }; seleccion: number; ancho: number }) {
  let i = -1
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={c(C.texto)}>Rama </Text>
        <Text bold color={c(C.lima)}>
          {situacion.rama}
        </Text>
        <Text color={c(C.suave)}>
          {"  "}
          {situacion.sinGuardar} sin guardar · {situacion.sinSubir} sin subir · {situacion.sinBajar} sin bajar
        </Text>
      </Box>
      {grupos.map((g) => (
        <Box key={g.paquete} flexDirection="column">
          <Grupo texto={`${g.paquete} · ${g.cambios.length}`} ancho={ancho} />
          {g.cambios.map((x) => {
            i += 1
            const activo = seleccion === i
            return (
              <Box key={x.ruta}>
                <Text color={c(activo ? C.lima : C.borde)}>{sel(activo)}</Text>
                <Text color={c(x.etiqueta === "nuevo" ? C.ok : x.etiqueta === "borrado" ? C.error : C.suave)}>{columna(x.etiqueta, 12)}</Text>
                <Text color={c(activo ? C.lima : C.texto)} bold={activo}>
                  {recortar(x.ruta, Math.max(10, ancho - 18))}
                </Text>
              </Box>
            )
          })}
        </Box>
      ))}
      <Grupo texto="Últimos commits" ancho={ancho} />
      {commits.slice(0, 6).map((x) => (
        <Box key={x.hash}>
          <Text color={c(C.borde)}>{"  " + x.hash} </Text>
          <Text color={c(C.suave)}>{recortar(x.mensaje, Math.max(10, ancho - 30))}</Text>
          <Text color={c(C.tenue)}> {x.cuando}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={c(C.tenue)}>⏎ ver el diff del archivo seleccionado</Text>
      </Box>
    </Box>
  )
}

export function PanelDespliegue({ corridas, msg, seleccion, ancho }: { corridas: Corrida[]; msg?: string; seleccion: number; ancho: number }) {
  return (
    <Box flexDirection="column">
      {msg ? <Text color={c(C.aviso)}>▲ {recortar(msg, ancho - 4)}</Text> : null}
      {corridas.map((x, i) => {
        const s = semaforo(x.estado)
        return (
          <Box key={x.id}>
            <Text color={c(seleccion === i ? C.lima : C.borde)}>{sel(seleccion === i)}</Text>
            <Text color={s.color}>{s.punto} </Text>
            <Text color={c(seleccion === i ? C.lima : C.texto)} bold={seleccion === i}>
              {columna(x.nombre, 18)}
            </Text>
            <Text color={s.color}>{columna(x.resultado, 24)}</Text>
            <Text color={c(C.tenue)}>{recortar(x.commit, Math.max(10, ancho - 62))}</Text>
            <Text color={c(C.borde)}> {x.cuando}</Text>
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text color={c(C.tenue)}>⏎ en una que falló muestra por qué</Text>
      </Box>
    </Box>
  )
}

export function PanelEndpoints({ lista, seleccion, ancho, alto, desde }: { lista: Endpoint[]; seleccion: number; ancho: number; alto: number; desde: number }) {
  const color = (m: string) => c(m === "GET" ? C.ok : m === "DELETE" ? C.error : m === "POST" ? C.aviso : C.suave)
  const vistos = lista.slice(desde, desde + alto)
  return (
    <Box flexDirection="column">
      {vistos.map((e, i) => (
        <Box key={e.id}>
          <Text color={c(seleccion === desde + i ? C.lima : C.borde)}>{sel(seleccion === desde + i)}</Text>
          <Text color={color(e.metodo)}>{columna(e.metodo, 7)}</Text>
          <Text color={c(seleccion === desde + i ? C.lima : C.texto)}>{columna(e.ruta, Math.min(46, Math.floor(ancho * 0.42)))}</Text>
          <Text color={c(C.tenue)}>{recortar(e.resumen, Math.max(10, ancho - 10 - Math.min(46, Math.floor(ancho * 0.42))))}</Text>
        </Box>
      ))}
      {lista.length > desde + vistos.length ? (
        <Box marginTop={1}>
          <Text color={c(C.tenue)}>  ↓ {lista.length - desde - vistos.length} más · PgDn · / filtra</Text>
        </Box>
      ) : null}
    </Box>
  )
}

export function PanelBuscador({ hallazgos, consulta, seleccion, ancho, resumen }: { hallazgos: Hallazgo[]; consulta: string; seleccion: number; ancho: number; resumen: { tipo: string; cuantos: number }[] }) {
  return (
    <Box flexDirection="column">
      {!consulta ? (
        <Box flexDirection="column">
          <Text color={c(C.suave)}>Busca entre {resumen.reduce((a, r) => a + r.cuantos, 0)} cosas del proyecto:</Text>
          <Text color={c(C.tenue)}>{recortar(resumen.map((r) => `${r.cuantos} ${r.tipo.toLowerCase()}`).join(" · "), ancho)}</Text>
        </Box>
      ) : null}
      {consulta && !hallazgos.length ? <Text color={c(C.tenue)}>Nada con eso.</Text> : null}
      {hallazgos.map((h, i) => (
        <Box key={h.id}>
          <Text color={c(seleccion === i ? C.lima : C.borde)}>{sel(seleccion === i)}</Text>
          <Text color={c(C.tenue)}>{columna(h.tipo, 17)}</Text>
          <Text color={c(seleccion === i ? C.lima : C.texto)} bold={seleccion === i}>
            {columna(h.titulo, Math.min(34, Math.floor(ancho * 0.3)))}
          </Text>
          <Text color={c(C.suave)}>{recortar(h.detalle || h.donde || "", Math.max(10, ancho - 22 - Math.min(34, Math.floor(ancho * 0.3))))}</Text>
        </Box>
      ))}
      {hallazgos.length ? (
        <Box marginTop={1}>
          <Text color={c(C.tenue)}>⏎ va al panel donde vive</Text>
        </Box>
      ) : null}
    </Box>
  )
}

/** La salida larga de los registros, el diff o el log del CI. */
export function Texto({ lineas, ancho, alto, colorear }: { lineas: string[]; ancho: number; alto: number; colorear?: boolean }) {
  const color = (l: string) => {
    if (!colorear) return c(C.tenue)
    if (l.startsWith("+") && !l.startsWith("+++")) return c(C.ok)
    if (l.startsWith("-") && !l.startsWith("---")) return c(C.error)
    if (l.startsWith("@@")) return c(C.suave)
    if (/\berror\b|failed|✗|×/i.test(l)) return c(C.aviso)
    return c(C.tenue)
  }
  return (
    <Box flexDirection="column">
      {lineas.slice(-alto).map((l, i) => (
        <Text key={i} color={color(l)}>
          {recortar(l, ancho)}
        </Text>
      ))}
    </Box>
  )
}
