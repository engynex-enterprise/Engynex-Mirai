// Un bloque de salud (Local, Producción, Repo, VPS) con su semáforo y sus chequeos.
import { Box, Text } from "ink"
import type { Bloque } from "../datos/tipos.ts"
import { COLORES, ETIQUETA, color, semaforo } from "./tema.ts"

export function BloqueSalud({ bloque, ancho, abierto, seleccionado }: { bloque: Bloque; ancho: number; abierto: boolean; seleccionado: boolean }) {
  const s = semaforo(bloque.estado)
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={seleccionado ? color(COLORES.lima) : undefined} bold>
          {seleccionado ? "▸ " : "  "}
        </Text>
        <Text color={s.color}>{s.simbolo} </Text>
        <Text bold color={seleccionado ? color(COLORES.lima) : color(COLORES.blanco)}>
          {bloque.titulo.padEnd(20)}
        </Text>
        <Text color={color(COLORES.gris)}>{ETIQUETA[bloque.estado]}</Text>
        {bloque.aPulso && bloque.estado === "apagado" ? <Text color={color(COLORES.gris)}> · ⏎ consultar</Text> : null}
      </Box>
      {abierto
        ? bloque.chequeos.map((c) => {
            const cs = semaforo(c.estado)
            return (
              <Box key={c.id} flexDirection="column">
                <Box>
                  <Text>{"    "}</Text>
                  <Text color={cs.color}>{cs.simbolo} </Text>
                  <Text color={color(COLORES.blanco)}>{c.titulo}: </Text>
                  <Text color={color(COLORES.gris)}>{c.detalle.slice(0, Math.max(10, ancho - c.titulo.length - 12))}</Text>
                  {c.ms !== undefined ? <Text color={color(COLORES.gris)}> ({c.ms} ms)</Text> : null}
                </Box>
                {c.arregla ? (
                  <Box>
                    <Text>{"      "}</Text>
                    <Text color={color(COLORES.amarillo)}>→ {c.arregla}</Text>
                  </Box>
                ) : null}
              </Box>
            )
          })
        : null}
    </Box>
  )
}
