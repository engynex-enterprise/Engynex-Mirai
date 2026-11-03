// Prettier de Mirai (estilo del código actual: sin punto y coma, comillas dobles, líneas largas).
// No hay un "format" obligatorio: es la referencia para el editor y para código nuevo.
/** @type {import("prettier").Config} */
export default {
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 160,
  arrowParens: "always",
  plugins: ["prettier-plugin-tailwindcss"],
}
