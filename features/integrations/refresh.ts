import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { todayBogota } from "@/lib/domain"
import { fetchFestivos, fetchFx, fetchTrm, fetchUsura } from "./data-sources"

/**
 * Actualiza los datos de referencia (TRM, usura, festivos) y los copia a los libros que tienen
 * "automático" activado. Lo llama el cron diario; cada fuente falla por separado.
 */
export async function refreshReferenceData() {
  const db = supabaseAdmin()
  const log: string[] = []
  const step = async (n: string, f: () => Promise<string>) => { try { log.push(`${n}: ${await f()}`) } catch (e) { log.push(`${n}: ERROR ${(e as Error).message}`) } }

  await step("trm", async () => {
    const t = await fetchTrm()
    await db.from("ref_trm").upsert({ fecha: t.fecha, valor: t.valor, fuente: "Superfinanciera · datos.gov.co (32sa-8pi3)" })
    let eur = 0
    try { eur = Math.round((await fetchFx()).EUR) } catch { /* sin EUR hoy */ }
    const { data: books } = await db.from("book_settings").select("book_id,trm").eq("trm_auto", true)
    for (const b of books ?? []) {
      const trm = { ...(b.trm as Record<string, number>), USD: Math.round(t.valor), ...(eur ? { EUR: eur } : {}) }
      await db.from("book_settings").update({ trm }).eq("book_id", b.book_id)
    }
    return `${t.valor} (${t.fecha}) → ${books?.length ?? 0} libros`
  })

  await step("usura", async () => {
    const u = await fetchUsura()
    await db.from("ref_usury_rate").upsert({ desde: u.desde, hasta: u.hasta, modalidad: "consumo", tasa_ea: +u.usura.toFixed(2) })
    const { count } = await db.from("book_settings").update({ usura: +u.usura.toFixed(2) }, { count: "exact" }).eq("usura_auto", true)
    return `${u.usura.toFixed(2)} % (${u.desde}) → ${count ?? 0} libros`
  })

  await step("festivos", async () => {
    const y = Number(todayBogota().slice(0, 4))
    const rows = [...(await fetchFestivos(y)), ...(await fetchFestivos(y + 1))]
    await db.from("ref_holidays").upsert(rows)
    return `${rows.length} fechas`
  })
  return log
}
