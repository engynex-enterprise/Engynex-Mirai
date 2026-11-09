// Una tarjeta de ambiente: qué es, si está arriba, en qué puertos y qué se puede hacer con él.
import { Box, Text } from "ink"
import type { EstadoAmbiente } from "../datos/ambientes.ts"
import { C, c, recortar, semaforo } from "./tema.ts"

export function TarjetaAmbiente({ it, ancho, seleccionado }: { it: EstadoAmbiente; ancho: number; seleccionado: boolean }) {
  const s = semaforo(it.estado)
  const { ambiente } = it
  const arriba = it.estado !== "apagado"
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={c(seleccionado ? C.lima : C.borde)}>{seleccionado ? "▌" : " "}</Text>
        <Text color={s.color}> {s.punto} </Text>
        <Text bold color={c(seleccionado ? C.lima : C.texto)}>
          {ambiente.titulo}
        </Text>
        <Text color={s.color}> · {it.resumen}</Text>
      </Box>
      <Box>
        <Text color={c(C.borde)}>  │ </Text>
        <Text color={c(C.tenue)}>{recortar(ambiente.detalle, ancho - 6)}</Text>
      </Box>
      <Box>
        <Text color={c(C.borde)}>  │ </Text>
        <Text color={c(C.tenue)}>{recortar(it.puertos.map((p) => `${p.ocupado ? "●" : "○"} ${p.puerto} ${p.que}`).join("   "), ancho - 6)}</Text>
      </Box>
      {seleccionado ? (
        <Box>
          <Text color={c(C.borde)}>  │ </Text>
          <Text color={c(C.lima)}>⏎ {arriba ? "apagar" : "levantar"}</Text>
          {arriba && ambiente.url ? <Text color={c(C.tenue)}> · está en {ambiente.url}</Text> : null}
          {!arriba ? <Text color={c(C.tenue)}> · tarda {ambiente.tarda}</Text> : null}
        </Box>
      ) : null}
    </Box>
  )
}
