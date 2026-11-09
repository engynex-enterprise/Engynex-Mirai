// La lista del panel de la derecha: filas con nombre, valor y explicación, agrupadas y con scroll.
import { Box, Text } from "ink"
import type { Fila } from "../datos/tipos.ts"
import { COLORES, color } from "./tema.ts"

type Props = { filas: Fila[]; ancho: number; alto: number; desplazamiento: number; seleccion?: number }

/** Parte las filas en las que caben, respetando los encabezados de grupo. */
export function conGrupos(filas: Fila[]): ({ tipo: "grupo"; texto: string } | { tipo: "fila"; fila: Fila; indice: number })[] {
  const out: ({ tipo: "grupo"; texto: string } | { tipo: "fila"; fila: Fila; indice: number })[] = []
  let grupo: string | undefined
  filas.forEach((fila, indice) => {
    if (fila.grupo && fila.grupo !== grupo) {
      grupo = fila.grupo
      out.push({ tipo: "grupo", texto: grupo })
    }
    out.push({ tipo: "fila", fila, indice })
  })
  return out
}

/** Corta un texto marcando que sigue, en vez de dejarlo cortado en seco. */
const recortar = (texto: string, largo: number) => (texto.length <= largo ? texto : `${texto.slice(0, Math.max(0, largo - 1))}…`)

export function Lista({ filas, ancho, alto, desplazamiento, seleccion }: Props) {
  const todas = conGrupos(filas)
  const visibles = todas.slice(desplazamiento, desplazamiento + alto)
  const anchoNombre = Math.min(26, Math.max(12, ...filas.map((f) => f.nombre.length))) + 1
  const anchoValor = Math.min(22, Math.max(6, ...filas.map((f) => (f.valor ?? "").length))) + 1
  return (
    <Box flexDirection="column">
      {visibles.map((it, i) =>
        it.tipo === "grupo" ? (
          <Box key={`g${i}`} marginTop={i === 0 ? 0 : 1}>
            <Text bold color={color(COLORES.lima)}>
              {it.texto.toUpperCase()}
            </Text>
          </Box>
        ) : (
          <Box key={`f${it.indice}`}>
            <Text color={seleccion === it.indice ? color(COLORES.lima) : color(COLORES.blanco)} bold={seleccion === it.indice}>
              {(seleccion === it.indice ? "▸ " : "  ") + recortar(it.fila.nombre, anchoNombre).padEnd(anchoNombre)}
            </Text>
            <Text color={color(COLORES.gris)}>{recortar(it.fila.valor ?? "", anchoValor).padEnd(anchoValor)}</Text>
            <Text color={color(COLORES.gris)}>{recortar(it.fila.detalle, Math.max(0, ancho - anchoNombre - anchoValor - 4))}</Text>
          </Box>
        ),
      )}
      {todas.length > desplazamiento + alto ? (
        <Text color={color(COLORES.gris)}>  … {todas.length - desplazamiento - alto} más (PgDn)</Text>
      ) : null}
    </Box>
  )
}
