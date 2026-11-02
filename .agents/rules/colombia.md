# Dominio Colombia

> Verifica con fuentes oficiales (DIAN, Mintrabajo, DANE, alcaldías) antes de cambiar cualquier valor anual. Nunca inventes cifras. Todo cálculo tributario se muestra como estimado.

## Valores vigentes en el código
| Dato | Valor | Dónde |
|---|---|---|
| SMMLV 2026 | $1.750.905 | `m_nomina.js` (`smmlv()`, editable en Ajustes › Finanzas) |
| UVT 2024 / 2025 / 2026 | $47.065 / $49.799 / $52.374 | `UVTD` en `s_dian.js`, `uvtHoy()` |
| IPC 2025 | 5,1 % (tope de alza de arriendos 2026) | `calEst()` en `s_dian.js` |
| Calendario renta 2026 (AG 2025) | 12 ago – 26 oct según 2 últimos dígitos | `RENTA26` en `p_calendario.js` |
| Predial Bogotá 2026 | descuento 10 % hasta 17 abr; último plazo 10 jul | `FPL` |
| Vehicular Bogotá 2026 | descuento hasta 15 may; último plazo 24 jul | `FPL` |

## Laboral
- Prima de servicios: medio salario en junio (30 jun) y diciembre (20 dic).
- Cesantías: un salario al año, consignadas al fondo antes del 14 feb. Intereses: 12 % anual, pagados al trabajador antes del 31 ene.
- Dotación: quien gana hasta 2 SMMLV, tres entregas (30 abr, 31 ago, 20 dic).
- Descuentos empleado: salud 4 %, pensión 4 %, Fondo de Solidaridad Pensional desde 4 SMMLV (`fspPct`), retención en la fuente art. 383 (`retEmpleado`). Independientes: IBC 40 % del ingreso (Ley 2277/2022 art. 89), mínimo 1 SMMLV y máximo 25 SMMLV (Ley 797/2003 art. 5), salud 12,5 %, pensión 16 %, ARL.
- Retención mensual (art. 388 y DUR 1625 art. 1.2.4.1.6): ingreso − aportes obligatorios − deducciones (dependientes 10 % máx. 32 UVT, prepagada 16 UVT, vivienda) − otras exentas → 25 % exento (máx. 790 UVT/año) → límite 40 % (el de 1.340 UVT en la retención es discutido: Decreto 2231/2023 vs. Concepto DIAN 3028/2024). Mirai hoy solo pide aportes, así que el límite no cambia el resultado.
- SMMLV 2026: $1.750.905, vigente por el Decreto 0159 de 2026 (transitorio; el 1469/2025 está suspendido por el Consejo de Estado).

## Renta personas naturales (cédula general) — `s_dian.js`
- Obligado a declarar si supera cualquiera: ingresos brutos ≥ 1.400 UVT, patrimonio bruto > 4.500 UVT, compras con tarjeta, consumos o consignaciones > 1.400 UVT.
- Ingresos no constitutivos: aportes obligatorios a salud y pensión.
- Rentas exentas y deducciones sujetas al límite **40 % de la renta líquida o 1.340 UVT**: cesantías (según salario promedio, tabla art. 206 num. 4), aportes voluntarios pensión + AFC (30 % y 3.800 UVT), dependientes 10 % (máx. 32 UVT/mes), intereses de vivienda (1.200 UVT/año), medicina prepagada (16 UVT/mes), 50 % del GMF, intereses ICETEX (100 UVT), renta exenta 25 % (790 UVT/año).
- Fuera del límite: **72 UVT por dependiente hasta 4** y **1 % de compras con factura electrónica** (máx. 240 UVT). Desde el Decreto 2231/2023 (art. 1.2.1.20.3 DUR 1625) **el mismo dependiente sirve para el 10 % y para los 72 UVT**; el Consejo de Estado suspendió el aparte de la DIAN que decía lo contrario (auto exp. 28541, 21-ene-2025). Los 72 UVT y el 1 % no se usan en la retención mensual, solo en la declaración.
- Dependientes: hijos < 18; 18–25 si estudian y el padre o la madre les paga la educación superior o técnica (Ley 2411 de 2024; antes 23); con discapacidad; cónyuge, padres o hermanos sin ingresos > 260 UVT o con discapacidad. Solo un declarante puede tomarlo.
- Tarifa art. 241 (en UVT): 0–1.090: 0 %; 1.090–1.700: 19 %; 1.700–4.100: 28 % + 116; 4.100–8.670: 33 % + 788; 8.670–18.970: 35 % + 2.296; 18.970–31.000: 37 % + 5.901; > 31.000: 39 % + 10.352.
- Patrimonio: inmuebles al mayor entre costo fiscal y avalúo catastral; demás bienes por costo; saldos al 31 de diciembre.
- Deudas del patrimonio: pasivos, préstamos (pagos hasta el 31 de diciembre) y tarjetas de crédito (compras y cuotas facturadas hasta esa fecha).
- Gastos deducibles (`expenses.deducible`): salud = solo prepagada, pólizas o planes complementarios (16 UVT/mes, art. 387 ET; DUR 1625 art. 1.2.4.1.6); vivienda = solo intereses del crédito o leasing habitacional (1.200 UVT, art. 119); educación = solo intereses ICETEX propios (100 UVT); el arriendo, las matrículas y los gastos médicos sueltos no se restan; los gastos de un dependiente no se restan por su valor.
- No incluido (aún): dividendos, ganancias ocasionales, rentas no laborales detalladas, anticipo, pérdidas, renta presuntiva, régimen SIMPLE.

## Impuestos locales (estimados en el calendario)
- Predial: si el usuario no da el valor del recibo, ≈ 7 por mil del avalúo catastral (aproximación).
- Vehicular Bogotá: 1,5 % / 2,5 % / 3,5 % del avalúo comercial según rangos (aproximación; los rangos cambian cada año).
