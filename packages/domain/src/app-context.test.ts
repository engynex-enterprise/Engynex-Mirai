import { describe, expect, it } from "vitest"
import { buildAppContext, findBook, NoHouseholdError, pickBook, type RawAppContext } from "./app-context"
import { FREE_PLAN } from "./plans"

const premium = { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: { libros: 5 }, precio_mes: 14900 }
const raw = (o: Partial<RawAppContext> = {}): RawAppContext => ({
  profile: { id: "u1", email: "ana@correo.co", nombre: "Ana", avatar_url: null, apodo: "Anita", nacimiento: null, last_book_id: "b2" },
  admin: false,
  households: [
    { id: "h1", nombre: "Casa", role: "owner", access_role: "owner", plan: premium },
    { id: "h2", nombre: "Negocio", role: "editor", access_role: "registra", plan: null },
  ],
  books: [
    { id: "b1", nombre: "Personal", tipo: "personal", icon: "home", household_id: "h1", is_default: true },
    { id: "b2", nombre: "Tienda", tipo: "negocio", icon: "store", household_id: "h2", is_default: false },
  ],
  ...o,
})

describe("buildAppContext (paridad con getAppContext de apps/web/lib/dal.ts)", () => {
  it("usa el libro pedido, con su hogar, rol fino y plan", () => {
    const c = buildAppContext(raw(), { uid: "u1", wantedBookId: "b1" })
    expect(c.book).toEqual({ id: "b1", nombre: "Personal", tipo: "personal", icon: "home" })
    expect(c.household).toEqual({ id: "h1", nombre: "Casa", role: "owner", access: "owner" })
    expect(c.plan).toMatchObject({ id: "premium", features: ["ia", "banco", "impuestos", "familia"], ads: false, pago: true })
    expect(c.books).toHaveLength(2)
    expect(c.user).toEqual({ id: "u1", email: "ana@correo.co", nombre: "Ana", avatar: null, apodo: "Anita", nacimiento: null })
  })

  it("sin libro pedido: el último que abrió; si no, el predeterminado; si no, el primero", () => {
    expect(buildAppContext(raw(), { uid: "u1" }).book.id).toBe("b2")
    // Igual que la cookie en la web: si el libro pedido no existe, NO vuelve al último abierto, va al predeterminado.
    expect(buildAppContext(raw(), { uid: "u1", wantedBookId: "otro" }).book.id).toBe("b1")
    const sinUltimo = raw({ profile: { ...raw().profile!, last_book_id: null } })
    expect(buildAppContext(sinUltimo, { uid: "u1" }).book.id).toBe("b1")
    const sinDefault = raw({ profile: null, books: raw().books.map((b) => ({ ...b, is_default: false })) })
    expect(pickBook(sinDefault)?.id).toBe("b1")
  })

  it("rol fino 'registra' y plan Gratis cuando el hogar no tiene plan", () => {
    const c = buildAppContext(raw(), { uid: "u1", wantedBookId: "b2" })
    expect(c.household).toEqual({ id: "h2", nombre: "Negocio", role: "editor", access: "registra" })
    expect(c.plan).toEqual(FREE_PLAN)
  })

  it("respaldos: correo de los claims, nombre 'Tú' y plan pasado aparte", () => {
    const r = raw({ profile: null, households: raw().households.map(({ plan: _p, ...h }) => h) })
    const c = buildAppContext(r, { uid: "u1", claimsEmail: "jwt@correo.co", wantedBookId: "b1", planRow: premium })
    expect(c.user).toMatchObject({ email: "jwt@correo.co", nombre: "Tú", apodo: "" })
    expect(c.plan.id).toBe("premium")
  })

  it("sin hogar o sin libro: NoHouseholdError (la web manda a /bienvenida)", () => {
    expect(() => buildAppContext(raw({ households: [] }), { uid: "u1" })).toThrow(NoHouseholdError)
    expect(() => buildAppContext(raw({ books: [] }), { uid: "u1" })).toThrow(NoHouseholdError)
  })

  it("findBook solo devuelve libros que la persona ve", () => {
    expect(findBook(raw(), "b2")?.household_id).toBe("h2")
    expect(findBook(raw(), "b9")).toBeNull()
  })
})
