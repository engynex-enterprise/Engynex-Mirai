// Registros escogibles sin duplicar (F2-D): contacto, entidad (banco, cooperativa, casa de empeño…) o proveedor.
// Antes de crear uno se busca uno igual con las reglas de la web (@mirai/domain/registros y proveedores):
//   contacto  → mismo documento, o mismo nombre si los documentos no dicen que son personas distintas (findContact)
//   entidad   → mismo NIT, o mismo nombre normalizado (findEntity)
//   proveedor → mismo nombre normalizado (findProvider = public.provider_norm())
// Si ya existe, se completan los datos que le faltaban sin borrar los que tenía (como loan-form.tsx).
// Lo usan préstamos, importar y el chat (por inyección).
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { NuevoRegistro } from "@mirai/contracts/modules/loans"
import { cleanProvName, findProvider, tipoSugerido } from "@mirai/domain/proveedores"
import { atLeast } from "@mirai/domain/household/roles"
import { findContact, findEntity } from "@mirai/domain/registros"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"

export type Registro = { tabla: "contacts" | "entities" | "providers"; id: string; nombre: string; creado: boolean }

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "")

@Injectable()
export class RegistrosService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** Busca uno igual; si no hay y `crear`, lo crea (exige «Colabora»: los catálogos son del hogar). */
  async resolve(r: NuevoRegistro, crear = true): Promise<Registro | null> {
    const { w, store } = this
    const list = (await store.rows(w.scope, r.tabla, w.bookId, { select: r.tabla === "contacts" ? ["id", "nombre", "doc", "telefono", "email"] : r.tabla === "entities" ? ["id", "nombre", "nit"] : ["id", "nombre", "nit"] })) as (Rec & { nombre: string })[]
    const found = r.tabla === "contacts" ? findContact(list, { nombre: r.nombre, doc: r.doc }) : r.tabla === "entities" ? findEntity(list, { nombre: r.nombre, nit: r.nit }) : findProvider(list, r.nombre)
    if (found) {
      if (crear && r.tabla === "contacts" && atLeast(w.access, "editor")) {
        const doc = digits(r.doc)
        const patch: Rec = {
          ...(!found.telefono && r.telefono?.trim() ? { telefono: r.telefono.trim() } : {}),
          ...(!found.email && r.email?.trim() ? { email: r.email.trim() } : {}),
          ...(!found.doc && doc ? { doc, doc_tipo: r.doc_tipo ?? "CC" } : {}),
        }
        if (Object.keys(patch).length) {
          await store.update(w.scope, "contacts", w.bookId, String(found.id), patch)
          w.changed("contacts", String(found.id))
        }
      }
      return { tabla: r.tabla, id: String(found.id), nombre: String(found.nombre), creado: false }
    }
    if (!crear) return null
    w.requireRole("editor", "planear")
    const id = randomUUID()
    const base = { id, book_id: w.bookId, created_by: w.userId }
    const row: Rec =
      r.tabla === "contacts"
        ? { ...base, tipo: r.tipo ?? "persona", nombre: r.nombre.trim(), doc_tipo: r.doc_tipo ?? "CC", doc: digits(r.doc), telefono: r.telefono?.trim() ?? "", email: r.email?.trim() ?? "", relacion: r.relacion?.trim() ?? "" }
        : r.tabla === "entities"
          ? { ...base, nombre: r.nombre.trim().slice(0, 60), nit: digits(r.nit), tipo: r.tipo ?? "Banco" }
          : { ...base, nombre: cleanProvName(r.nombre), nit: digits(r.nit), tipo: tipoSugerido(r.nombre) }
    const [saved] = await store.insert(w.scope, r.tabla, [row])
    w.changed(r.tabla, id, "INSERT")
    return { tabla: r.tabla, id: String(saved?.id ?? id), nombre: String(saved?.nombre ?? row.nombre), creado: true }
  }
}
