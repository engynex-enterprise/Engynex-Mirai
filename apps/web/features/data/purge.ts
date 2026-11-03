import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Borrado de archivos en Storage (Ley 1581, supresión): adjuntos, logos y respaldos de un libro, y la foto de perfil
// y las capturas de opiniones de una persona. Recorre las subcarpetas (antes solo se borraba el primer nivel).

type Db = ReturnType<typeof supabaseAdmin>

/** Todas las rutas de archivos bajo `prefix` (recursivo, por páginas de 1.000). */
async function listAll(db: Db, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return []
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error || !data?.length) break
    for (const f of data) {
      const p = `${prefix}/${f.name}`
      // Las carpetas vienen sin id ni metadata.
      if (!f.id && !f.metadata) out.push(...(await listAll(db, bucket, p, depth + 1)))
      else out.push(p)
    }
    if (data.length < 1000) break
  }
  return out
}

async function removeAll(db: Db, bucket: string, prefix: string) {
  const paths = await listAll(db, bucket, prefix)
  for (let i = 0; i < paths.length; i += 500) await db.storage.from(bucket).remove(paths.slice(i, i + 500))
  return paths.length
}

/** Archivos de los libros de un hogar (antes de borrar el hogar). */
export async function purgeHouseholdFiles(householdId: string) {
  const db = supabaseAdmin()
  const { data: bs } = await db.from("books").select("id").eq("household_id", householdId)
  let n = 0
  for (const b of bs ?? []) for (const bucket of ["attachments", "backups", "logos"]) n += await removeAll(db, bucket, b.id)
  return n
}

/** Foto de perfil subida y capturas de opiniones de una persona. */
export async function purgeUserFiles(userId: string) {
  const db = supabaseAdmin()
  return (await removeAll(db, "avatars", userId)) + (await removeAll(db, "feedback", userId))
}
