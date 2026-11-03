// Paleta de las gráficas del Dashboard: categórica en orden fijo (azul, naranja, aguamarina, amarillo, magenta, verde,
// violeta), validada para daltonismo (ΔE ≥ 8 entre vecinos), con su propio tono en modo oscuro. Tres tonos claros
// (aguamarina, amarillo y magenta) quedan bajo 3:1 sobre fondo claro: por eso cada gráfica lleva leyenda con valores
// o etiquetas visibles. Los colores de estado (bien, alerta, mal) son otros y siempre van con ícono y texto.
export const VIZ = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
  { light: "#e87ba4", dark: "#d55181" },
  { light: "#008300", dark: "#008300" },
  { light: "#6250d6", dark: "#9085e9" },
] as const

/** Las mismas posiciones como clases de Tailwind (para barras y puntos en HTML). */
export const VIZ_BG = [
  "bg-[#2a78d6] dark:bg-[#3987e5]",
  "bg-[#eb6834] dark:bg-[#d95926]",
  "bg-[#1baf7a] dark:bg-[#199e70]",
  "bg-[#eda100] dark:bg-[#c98500]",
  "bg-[#e87ba4] dark:bg-[#d55181]",
  "bg-[#008300] dark:bg-[#008300]",
  "bg-[#6250d6] dark:bg-[#9085e9]",
] as const
