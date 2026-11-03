// Lo que el flujo integral necesita y no viaja en el libro (estimados de impuestos, mesadas y fondo de emergencia),
// armado en el servidor para el chat con LA MISMA regla que features/balance/use-integral.ts (Balance y Dashboard).
// Así "¿cuánto me queda?" en el chat da la misma cifra que el Balance. Puro: recibe las filas ya cargadas.
// El código vive en @mirai/domain/integral-extras (la API lo usa también para las vistas de insights).
export { esRenta, integralExtras, necesitaRenta, type ExtrasRows } from "@mirai/domain/integral-extras"
