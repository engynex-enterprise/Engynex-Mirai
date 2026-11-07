/**
 * Vacía = sin definir. Docker Compose (`${VAR:-}`), Coolify y Terraform pasan "" cuando una variable opcional no tiene
 * valor; los esquemas zod la rechazarían ("Este campo es obligatorio") en vez de tratarla como ausente. Se quitan del
 * entorno al arrancar, antes de validar nada. Devuelve los nombres quitados (nunca valores).
 */
export function dropBlankEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const quitadas: string[] = []
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.trim() === "") {
      delete env[k]
      quitadas.push(k)
    }
  }
  return quitadas
}
