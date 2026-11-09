// Un bloque de salud (Local, Producción, Repo, VPS): cabecera con semáforo y sus chequeos al abrir.
import { Box, Text } from "ink"
import type { Bloque } from "../datos/tipos.ts"
import { C, c, columna, recortar, semaforo } from "./tema.ts"

export function BloqueSalud({ bloque, ancho, abierto, seleccionado }: { bloque: Bloque; ancho: number; abierto: boolean; seleccionado: boolean }) {
  const s = semaforo(bloque.estado)
  const cuantos = bloque.chequeos.filter((x) => x.estado === "error" || x.estado === "aviso").length
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={c(seleccionado ? C.lima : C.borde)}>{seleccionado ? "▌" : " "}</Text>
        <Text color={s.color}> {s.punto} </Text>
        <Text bold color={c(seleccionado ? C.lima : C.texto)}>
          {columna(bloque.titulo, 22)}
        </Text>
        <Text color={s.color}>{columna(s.palabra, 10)}</Text>
        <Text color={c(C.tenue)}>
          {bloque.aPulso && bloque.estado === "apagado"
            ? "⏎ consultar por SSH"
            : cuantos > 0
              ? `${cuantos} por revisar`
              : abierto
                ? "⏎ cerrar"
                : `${bloque.chequeos.length} revisiones · ⏎ ver`}
        </Text>
      </Box>
      {abierto
        ? bloque.chequeos.map((ch) => {
            const cs = semaforo(ch.estado)
            const anchoDetalle = Math.max(10, ancho - 32)
            return (
              <Box key={ch.id} flexDirection="column">
                <Box>
                  <Text color={c(C.borde)}>  │ </Text>
                  <Text color={cs.color}>{cs.punto} </Text>
                  <Text color={c(C.suave)}>{columna(ch.titulo, 18)}</Text>
                  <Text color={c(C.tenue)}>{recortar(ch.detalle, anchoDetalle)}</Text>
                  {ch.ms !== undefined ? <Text color={c(C.borde)}> {ch.ms}ms</Text> : null}
                </Box>
                {ch.arregla ? (
                  <Box>
                    <Text color={c(C.borde)}>  │ </Text>
                    <Text color={c(C.aviso)}>  ↳ {recortar(ch.arregla, ancho - 10)}</Text>
                  </Box>
                ) : null}
              </Box>
            )
          })
        : null}
    </Box>
  )
}
