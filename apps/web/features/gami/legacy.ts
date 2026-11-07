// Rama heredada de Logros (V7-H2): lo que el navegador escribía directo en Supabase cuando el interruptor `gami` está
// apagado. Con `gami` encendido lo hace la API (POST /v1/books/:b/gami/visit y …/gami/check). Se borra en V7-R.
import { createClient } from "@/utils/supabase/client"

/** Visita del día (racha), sin duplicar. */
export async function gamiVisitLegacy(bookId: string, userId: string, dia: string) {
  await createClient().from("gami_visits").upsert({ book_id: bookId, user_id: userId, dia }, { onConflict: "book_id,user_id,dia", ignoreDuplicates: true })
}

/** Guarda insignias y misiones cumplidas y el nivel máximo (solo quien edita todo), como gamiCheck de la v4. */
export async function gamiCheckLegacy(o: { bookId: string; today: string; badges: { id: string }[]; missions: { k: string; wk: string }[]; first: boolean; subio: boolean; canEdit: boolean; maxLevel: number; init: string }) {
  const sb = createClient()
  if (o.badges.length) await sb.from("gami_badges").upsert(o.badges.map((b) => ({ book_id: o.bookId, badge: b.id, unlocked_at: o.today })), { onConflict: "book_id,badge", ignoreDuplicates: true })
  if (o.missions.length) await sb.from("gami_missions").upsert(o.missions.map((m) => ({ book_id: o.bookId, semana: m.wk, mision: m.k })), { onConflict: "book_id,semana,mision", ignoreDuplicates: true })
  if (o.canEdit && (o.first || o.subio)) await sb.from("gami_state").upsert({ book_id: o.bookId, max_level: o.maxLevel, init_date: o.init })
}
