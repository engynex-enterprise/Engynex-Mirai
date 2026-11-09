// La lista del panel de la derecha: columnas alineadas, grupos y scroll.
import { Box, Text } from "ink"
import type { Fila as FilaDato } from "../datos/tipos.ts"
import { C, c } from "./tema.ts"
import { Fila, Grupo } from "./marco.tsx"

type Props = { filas: FilaDato[]; ancho: number; alto: number; desplazamiento: number; seleccion?: number }

type Renglon = { tipo: "grupo"; texto: string } | { tipo: "fila"; fila: FilaDato; indice: number }

/** Intercala los encabezados de grupo entre las filas. */
export function conGrupos(filas: FilaDato[]): Renglon[] {
  const out: Renglon[] = []
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

/** Reparte el ancho entre nombre, valor y explicación según lo que traigan los datos. */
export function anchos(filas: FilaDato[], ancho: number): [number, number, number] {
  const nombre = Math.min(30, Math.max(14, ...filas.map((f) => f.nombre.length))) + 1
  const hayValor = filas.some((f) => f.valor)
  const valor = hayValor ? Math.min(24, Math.max(8, ...filas.map((f) => (f.valor ?? "").length))) + 1 : 0
  return [nombre, valor, Math.max(0, ancho - nombre - valor - 3)]
}

export function Lista({ filas, ancho, alto, desplazamiento, seleccion }: Props) {
  const todas = conGrupos(filas)
  const visibles = todas.slice(desplazamiento, desplazamiento + alto)
  const a = anchos(filas, ancho)
  const faltan = todas.length - desplazamiento - visibles.length
  return (
    <Box flexDirection="column">
      {visibles.map((it, i) =>
        it.tipo === "grupo" ? (
          <Grupo key={`g${i}`} texto={it.texto} ancho={ancho} />
        ) : (
          <Fila key={`f${it.indice}`} nombre={it.fila.nombre} valor={it.fila.valor} detalle={it.fila.detalle} anchos={a} resaltada={seleccion === it.indice} />
        ),
      )}
      {faltan > 0 ? (
        <Box marginTop={1}>
          <Text color={c(C.tenue)}>  ↓ {faltan} más · PgDn</Text>
        </Box>
      ) : null}
    </Box>
  )
}
