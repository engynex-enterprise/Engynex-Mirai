// Puerto del módulo catalogs (§2.1): el servicio solo conoce esta interfaz. Todos los métodos reciben el alcance
// (DbScope): con UserScope la RLS de la base vuelve a filtrar aunque el servicio ya revisó el rol (defensa en dos capas).
import type { CategoryRow } from "@mirai/contracts/modules/catalogs"
import type { DbScope } from "../../core/db/scope"

export type ListCategories = { bookId: string; grupo?: string }

export abstract class CatalogsRepo {
  abstract listCategories(scope: DbScope, q: ListCategories): Promise<CategoryRow[]>
}
