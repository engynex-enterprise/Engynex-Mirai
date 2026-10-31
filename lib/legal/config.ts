/** Datos del responsable del tratamiento (Ley 1581 de 2012). Se configuran con variables de entorno. */
export const LEGAL = {
  responsable: process.env.NEXT_PUBLIC_LEGAL_OWNER || "El administrador de esta instalación de Mirai",
  nit: process.env.NEXT_PUBLIC_LEGAL_NIT || "",
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || "",
  ciudad: process.env.NEXT_PUBLIC_LEGAL_CITY || "Bogotá D.C., Colombia",
}
