// Datos semilla de las pruebas (F2-B-10, versión en memoria): un hogar Gratis con 5 personas, una por rol, y un
// hogar Premium. Sin tocar la base real (está saturada y la comparten pruebas y producción).
import type { CategoryRow } from "@mirai/contracts/modules/catalogs"
import type { RawAppContext } from "@mirai/domain/app-context"
import type { AccessRole } from "@mirai/domain/household/roles"

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`

export const H_GRATIS = id(100)
export const H_PREMIUM = id(200)
export const B_GRATIS = id(101)
export const B_PREMIUM = id(201)
export const B_AJENO = id(301)

export const USERS: Record<AccessRole | "outsider", string> = {
  owner: id(1), admin: id(2), editor: id(3), registra: id(4), viewer: id(5), outsider: id(9),
}

const legacy = (r: AccessRole) => (r === "owner" ? "owner" : r === "admin" || r === "editor" ? "editor" : "viewer")
const premium = { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: { libros: 5, personas: 8 }, precio_mes: 14900 }
const gratis = { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: { libros: 1, personas: 2, automatizaciones: 3 }, precio_mes: 0 }

const bGratis = { id: B_GRATIS, nombre: "Casa", tipo: "personal", icon: "home", household_id: H_GRATIS, is_default: true }
const bPremium = { id: B_PREMIUM, nombre: "Negocio", tipo: "negocio", icon: "store", household_id: H_PREMIUM, is_default: true }

/** Lo que devolvería mirai_app_context() para cada persona (la RLS ya filtró). */
export function rawFor(userId: string): RawAppContext {
  const role = (Object.entries(USERS).find(([, v]) => v === userId)?.[0] ?? "outsider") as AccessRole | "outsider"
  if (role === "outsider") return { profile: { id: userId, email: null, nombre: null, avatar_url: null, apodo: null, nacimiento: null, last_book_id: null }, admin: false, households: [], books: [] }
  const households: RawAppContext["households"] = [{ id: H_GRATIS, nombre: "Familia Pérez", role: legacy(role), access_role: role, plan: gratis }]
  const books = [bGratis]
  if (role === "owner") {
    households.push({ id: H_PREMIUM, nombre: "Tienda", role: "owner", access_role: "owner", plan: premium })
    books.push(bPremium)
  }
  return {
    profile: { id: userId, email: `${role}@correo.co`, nombre: role === "owner" ? "Ana" : null, avatar_url: null, apodo: role, nacimiento: null, last_book_id: null },
    admin: role === "owner",
    households,
    books,
  }
}

export const categories = (bookId: string): CategoryRow[] =>
  [
    { nombre: "Mercado", grupo: "necesidades", sort: 1 },
    { nombre: "Restaurantes", grupo: "gustos", sort: 3 },
    { nombre: "Arriendo", grupo: "necesidades", sort: 0 },
  ].map((c, i) => ({ id: id(1000 + i), book_id: bookId, icon: "tag", tope: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", created_by: USERS.owner, deleted_at: null, ...c }))
