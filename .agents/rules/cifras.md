# Reglas de cifras (montos, cálculos, proyecciones y mensajes)

> Revisión del 2026-11-08 (Inicio, Dashboard, Balance, Ingresos, Gastos, Me deben, Le debo). **No las rompas.**
> Toda cifra que ve la persona sale de `packages/domain` (nunca se calcula en la vista) y debe dar lo mismo en todas
> las pantallas donde aparece. Si dos pantallas muestran el mismo concepto con valores distintos, es un error.

## 1. Una sola cifra del mes: `flujoIntegral`
- `packages/domain/src/flujo-integral.ts` (`flujoIntegral`, `estadoIntegral`, `snapshotMes`, `proyeccionMeses`) junta
  entradas y salidas de todos los módulos **sin contar dos veces**: fijo↔gasto enlazado, tarjeta en base caja,
  cuota↔gasto, suscripción↔cobro, aporte a meta↔gasto.
- Inicio, Balance, Dashboard, Flujo de caja y el chat leen `F.tot` **tal cual**. No vuelvas a sumar ni restar nada en la vista.
- **Préstamos que te dan o que haces NO son ingreso ni gasto.** Quedan fuera de `tot.entra/sale/queda`
  (van en `credEntra`/`credSale`). `tot.caja` es lo mismo pero con préstamos.
  - Ejemplo: te prestan $1.000.000 y ganas $3.000.000 → "Te entra" = $3.000.000, no $4.000.000.

## 2. Proyecciones y predicciones
- **Nunca proyectes sin `proyectarMes`.** Proyecta solo con historial de ≥ 2 meses completos, o con ritmo de ≥ 14 días
  **y** ≥ 4 registros (`DIAS_MIN_PROYECCION`, `REGISTROS_MIN_PROYECCION` en `totals.ts`). Si no, el estado es
  "pronto": se muestra lo que lleva y no se afirma ningún "si sigues así…".
  - Ejemplo real (el error que lo originó): 3 gastos hormiga por $50.000 en 3 días se proyectaban a ~$400.000 al
    mes. Ahora: "Llevas $50.000. Pronto podremos decirte cuánto sería al mes".
- Hormiga: Inicio, Gastos, Indicadores y Avisos usan **`hormigas(b, today, mesVer?)`**, nada propio. Las palabras
  clave (`HKW`) van por palabra completa (`\b`): "tinto" no marca "tintorería". Suscripciones están en `NO_HORMIGA`.
  Lo que **se repite** también es hormiga: el mismo gasto 3+ veces en 30 días (`REPITE_HORMIGA`, `repeticiones()`,
  `vecesDe()`), siempre que no pase el doble del umbral y no sea una necesidad (grupo `n`).
  - Ejemplo: tres almuerzos de $35.000 con umbral $25.000 → $105.000 al mes que antes no se veían.
- "Gasto del día a día": `gastoVariable` (meses completos → si no, presupuesto → si no, `"sin-datos"`). Con
  `"sin-datos"` **no** se afirma "puedes ahorrar $X"; se dice qué falta registrar.
- Capacidad de ahorro/pago: con `variableBase`, no con el gasto parcial del mes en curso.

## 3. Tarjetas de crédito
- El pago del mes M es la factura del corte que se paga en M (`cortePagadoEnMes`, `fechaPagoMes`, `ultimoCortePagado`).
- La deuda baja en la fecha de pago: `compraEstado.k` = cuotas pagadas, `fact` = facturadas. **No depende del día en que se mire.**
- `tarjetaCuotaMes` sale del corte. Un pago antes de la fecha límite baja la deuda completo (`ajusteTarjeta`).
- El presupuesto cuenta las compras con tarjeta en la categoría (`gastadoPres`).

## 4. Préstamos (Me deben / Le debo)
- `cuotasDelMes` = lo que toca **este** mes según el plan. `cuotasMes` = compromiso mensual (pago único repartido entre
  sus meses; "solo intereses"/americano = los intereses). No los mezcles: el KPI "Cuotas de este mes" usa `cuotasDelMes`.
- Tasa E.A. **siempre** con `eaDeMensual` / `mensualDeEA` (también en acuerdos y PDF). Sin intereses → E.A. 0.
- "Te debe hoy" / "Para saldar" = `paraSaldar` (capital + intereses vencidos `intVencido`), no solo el capital.
- Pago por menos de la cuota = **parte de la cuota**: `HistRow` tipo "parcial", `CuotaRow.abonado`; la cuota se marca
  pagada cuando lo abonado la completa. API `pay` con `{ parcial }`.

## 5. Abonos (pagos por partes) — en todos los pagos
- **Gastos fijos:** `pagoPeriodo(f, per, pagos)` → `{ pagado, falta, completo, parcial, esperado }`. Columna
  `fixed_expense_payments.cierra`: `true` cierra el periodo, `false` es abono, `null` (pagos de antes) cuenta como
  completo si cubre lo esperado o si el fijo es variable.
  - Ejemplo (la moto): quincena de $70.000, pagas $40.000 → "Abonaste $40.000 · faltan $30.000". El flujo muestra
    $40.000 hechos y $30.000 pendientes (`fijo:id:per` y `fijo:id:per:falta`). "Pagué todo" cierra con lo pagado.
  - Vencidos, próximos y agenda usan `!completo` y muestran lo que **falta**, no el valor completo.
- **Compartidos:** `shared_group_expenses.tipo` = `'gasto'` | `'pago'`. Los pagos entre personas saldan y no son gasto.
- **Tarjetas:** los pagos menores al total ya bajaban la deuda (no cambia).
- **Suscripciones:** un cobro se puede pagar en partes. `expenses.sub_parcial` marca el abono: la suscripción **no**
  pasa al siguiente cobro (`proximo` no se mueve) y el flujo muestra lo abonado y lo que falta
  (`sub:id:mes` y `sub:id:mes:falta`), igual que un fijo. `gastosDeCobro` (plural) empareja TODOS los gastos de ese
  cobro. Cuando un abono lo completa, la base lo cierra sola y pasa al siguiente cobro.
  - Ejemplo: gimnasio de $50.000, abonas $20.000 → "Abonaste $20.000 · faltan $30.000"; con los $30.000 pasa a diciembre.
- **Enlazar un gasto con un fijo** (`link_expense_fixed`, `sugerirPagoFijo`): si el periodo ya tiene abonos, se compara
  con lo que **falta** y el gasto entra como un abono más (`p_cierra`); sin abonos antes, el enlace cierra el periodo
  como siempre. Un periodo ya cerrado no se puede enlazar.

## 6. Desgloses que cuadran y plata contada dos veces
- **Un desglose siempre suma su total.** "Lo que sale, por módulo" (Dashboard) usa `salidasPorModulo(F)`: solo
  consumo y deudas (`saleFlujo` = `gasto` + `deuda`), que es exactamente `tot.sale`. El ahorro y los préstamos que
  hiciste salen de la cuenta pero **no** están en "Sale", así que tampoco en ese desglose.
- Las columnas del Balance explican su total con `porClase(movs)`: ingresos / te pagan / te prestaron / sacaste del
  ahorro, y gastos / deudas / ahorras / prestaste. Por eso el total de "Salidas" puede ser mayor que el KPI "Sale".
- **Lo que la persona registró dos veces no se descuenta solo: se avisa.** `posiblesDobles(b, a, b, today)` encuentra
  los gastos sueltos que parecen el pago de un gasto fijo que el flujo ya cuenta (pagado o pendiente) y la app ofrece
  enlazarlos (decisión "dobles" del Dashboard y aviso del Balance). Adivinar cuál sobra sería inventar una cifra.
- **Ahorro apartado dudoso:** `ahorroApartado(b, fondoMovs?)` marca como `dudoso` lo guardado en una meta o en el
  fondo sin decir de qué cuenta salió cuando hay cuentas que llevan su saldo solas (el saldo no bajó y además suma
  como ahorro): `estadoIntegral` lo expone en `apartadoDudoso`/`dudosas` y el Balance lo avisa.
- **Pagos de tarjeta registrados a mano:** reemplazan la estimación del mes en el flujo. `pagosTarjetaRegistrados`
  los compara con la cuota del mes para avisar si la deuda baja más rápido o más despacio.

## 7. Otras reglas
- Gastos básicos sin aportes a metas/fondo (`link_type`). Fijos en USD/EUR se convierten (`fijoMensual(f, trm)`, `fijosMes(fixed, trm)`).
- "Meses que aguantas" = `fondoEstado` en todas partes.
- Ingresos: el valor se muestra **al mes** (`pagosMes(x)`, nunca `FREC`) con lo que llega en cada pago aparte
  ("$60.000 al mes · $30.000 cada quincena"). Para ubicar pagos en fechas: `incomePagos`, `fijoValor`.
- Suscripciones compartidas se dividen **una** vez.
- Impuestos registrados a mano (2408) no se suman otra vez con los del calendario.

## 8. Lista de chequeo al tocar una cifra
1. ¿La cifra sale de una función de `packages/domain` y la vista solo la formatea (`formatCOP`, `data-money`)?
2. ¿Aparece en otra pantalla? Búscala (`rg "nombreDeLaFuncion" apps/web/features`) y confirma que usan la misma función.
3. ¿El mensaje afirma algo ("vas a gastar", "puedes ahorrar", "te sobra")? Solo si la función devolvió datos
   suficientes; si no, el texto dice qué falta.
4. ¿Hay préstamos, tarjeta, abonos o moneda extranjera en juego? Revisa la sección de arriba que aplique.
5. Prueba Vitest en `packages/domain/src/*.test.ts` con un ejemplo en pesos que una persona entienda (como la moto).
   Si el cálculo existía en la v4 y cambió a propósito, exclúyelo de la paridad y deja la prueba explícita.
6. E2E si cambia lo que se ve (`apps/web/tests/e2e/`).

Para auditar: subagente `auditor-cifras` (`.claude/agents/auditor-cifras.md`) o el flujo `auditoria-modulos`
(`.claude/workflows/auditoria-modulos.js`).
