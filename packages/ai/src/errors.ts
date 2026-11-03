/**
 * Mensaje en español para errores de proveedores de IA (aiErrMsg de la v4). El orden importa: muchos
 * errores de cuota o de clave también mencionan el modelo, así que el de "modelo no disponible" va después.
 */
export function aiErrMsg(e: unknown, url?: string) {
  const m = String((e as Error)?.message ?? e)
  if (/credit card|customer_verification/i.test(m)) return "El AI Gateway de Vercel pide registrar una tarjeta para activar los créditos gratis."
  if (/429|quota|rate.?limit|resource.?exhausted|too many requests|insufficient.?(credits|balance|funds)/i.test(m)) return "Se alcanzó el límite de uso o de saldo del proveedor. Intenta más tarde o usa otro proveedor."
  if (/401|403|api.?key|unauthori[sz]ed|authentication|permission.?denied|forbidden/i.test(m)) return `La clave no es válida o no tiene permisos.${url ? ` Revísala en ${url}.` : ""}`
  if (/404|not.?found|does not exist|model_not_found|no such model|unknown model|invalid model|not a valid model|not supported|decommissioned|deprecated|no endpoints/i.test(m))
    return "El modelo elegido ya no existe o tu cuenta no tiene acceso. Abre Configurar y escoge otro de la lista."
  if (/fetch|network|ENOTFOUND|ECONNRESET|timeout|timed out/i.test(m)) return "No pudimos conectarnos con el proveedor. Revisa tu conexión."
  return m.slice(0, 200)
}
