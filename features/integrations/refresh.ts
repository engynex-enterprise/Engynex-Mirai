import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { todayBogota } from "@/lib/domain"
import { fetchCryptoPrices, fetchFestivos, fetchFx, fetchStockPrice, fetchTrm, fetchUsura } from "./data-sources"
import { getGlobalIntegration, getIntegration, type IntegrationValue } from "./store"

/**
 * Actualiza los datos de referencia (TRM, usura, festivos) y los copia a los libros que tienen "automático" activado.
 * Lo llama el cron diario; cada fuente falla por separado.
 * Respeta la consola › Integraciones globales: una fuente apagada no se consulta, y lo que se copia a cada libro (TRM,
 * usura, precios de inversiones) solo llega a los hogares de los planes elegidos (`getIntegration`).
 */
export async function refreshReferenceData() {
  const db = supabaseAdmin()
  const log: string[] = []
  const step = async (n: string, f: () => Promise<string>) => { try { log.push(`${n}: ${await f()}`) } catch (e) { log.push(`${n}: ERROR ${(e as Error).message}`) } }
  // Apagada en la consola = no se consulta. Sin fila global la fuente sin claves queda disponible (como hasta ahora).
  const apagada = async (kind: string) => (await getGlobalIntegration(kind))?.modo === "apagada"
  // Libro → hogar, y la integración efectiva de cada hogar (una consulta por hogar y fuente).
  const { data: bks } = await db.from("books").select("id,household_id").is("deleted_at", null)
  const hogarDe = new Map((bks ?? []).map((b) => [b.id, b.household_id]))
  const cache = new Map<string, Promise<IntegrationValue | null>>()
  const activa = (kind: string, householdId: string | undefined) => {
    if (!householdId) return Promise.resolve(null)
    const k = `${kind}:${householdId}`
    if (!cache.has(k)) cache.set(k, getIntegration(householdId, kind).catch(() => null))
    return cache.get(k)!
  }

  await step("trm", async () => {
    if (await apagada("trm")) return "apagada en la consola"
    const t = await fetchTrm()
    await db.from("ref_trm").upsert({ fecha: t.fecha, valor: t.valor, fuente: "Superfinanciera · datos.gov.co (32sa-8pi3)" })
    let eur = 0
    if (!(await apagada("fx"))) try { eur = Math.round((await fetchFx()).EUR) } catch { /* sin EUR hoy */ }
    const { data: books } = await db.from("book_settings").select("book_id,trm").eq("trm_auto", true)
    let n = 0
    for (const b of books ?? []) {
      if (!(await activa("trm", hogarDe.get(b.book_id)))?.enabled) continue
      const trm = { ...(b.trm as Record<string, number>), USD: Math.round(t.valor), ...(eur ? { EUR: eur } : {}) }
      await db.from("book_settings").update({ trm }).eq("book_id", b.book_id)
      n++
    }
    return `${t.valor} (${t.fecha}) → ${n} libros`
  })

  await step("usura", async () => {
    if (await apagada("usura")) return "apagada en la consola"
    const u = await fetchUsura()
    await db.from("ref_usury_rate").upsert({ desde: u.desde, hasta: u.hasta, modalidad: "consumo", tasa_ea: +u.usura.toFixed(2) })
    const { data: books } = await db.from("book_settings").select("book_id").eq("usura_auto", true)
    const ids: string[] = []
    for (const b of books ?? []) if ((await activa("usura", hogarDe.get(b.book_id)))?.enabled) ids.push(b.book_id)
    if (ids.length) await db.from("book_settings").update({ usura: +u.usura.toFixed(2) }).in("book_id", ids)
    return `${u.usura.toFixed(2)} % (${u.desde}) → ${ids.length} libros`
  })

  await step("festivos", async () => {
    if (await apagada("festivos")) return "apagada en la consola"
    const y = Number(todayBogota().slice(0, 4))
    const rows = [...(await fetchFestivos(y)), ...(await fetchFestivos(y + 1))]
    await db.from("ref_holidays").upsert(rows)
    return `${rows.length} fechas`
  })

  // Precios de inversiones: solo las que tienen símbolo y cantidad (valor = precio × cantidad, en su moneda).
  await step("inversiones", async () => {
    const { data: invs } = await db.from("investments").select("id,book_id,tipo,symbol,cantidad,currency").is("deleted_at", null).not("symbol", "is", null).gt("cantidad", 0)
    if (!invs?.length) return "sin inversiones con símbolo"
    let n = 0
    const cripto = invs.filter((x) => x.tipo === "cripto"), acciones = invs.filter((x) => (x.tipo === "acciones" || x.tipo === "fondo") && (x.currency || "COP") !== "COP") // cotizan en la moneda de su bolsa (USD…)
    if (cripto.length && !(await apagada("coingecko"))) {
      for (const cur of [...new Set(cripto.map((x) => (x.currency || "COP").toLowerCase()))]) {
        const grupo = cripto.filter((x) => (x.currency || "COP").toLowerCase() === cur)
        const ok = [] as typeof grupo
        for (const x of grupo) if ((await activa("coingecko", hogarDe.get(x.book_id)))?.enabled) ok.push(x)
        if (!ok.length) continue
        const key = (await getGlobalIntegration("coingecko"))?.secrets?.apiKey
        const precios = await fetchCryptoPrices(ok.map((x) => x.symbol!), cur, key)
        for (const x of ok) {
          const p = precios[x.symbol!.toLowerCase()]
          if (!p) continue
          await db.from("investments").update({ actual: Math.round(p * Number(x.cantidad) * 100) / 100 }).eq("id", x.id)
          n++
        }
      }
    }
    if (acciones.length && !(await apagada("stocks"))) {
      const precio = new Map<string, number | null>()
      for (const x of acciones) {
        const integ = await activa("stocks", hogarDe.get(x.book_id))
        const apiKey = integ?.secrets?.apiKey
        if (!integ?.enabled || !apiKey) continue
        const sym = x.symbol!.toUpperCase()
        if (!precio.has(sym)) precio.set(sym, await fetchStockPrice(sym, String(integ.config?.provider ?? "alphavantage"), apiKey).catch(() => null))
        const p = precio.get(sym)
        if (!p) continue
        await db.from("investments").update({ actual: Math.round(p * Number(x.cantidad) * 100) / 100 }).eq("id", x.id)
        n++
      }
    }
    return `${n} de ${invs.length} actualizadas`
  })
  return log
}
