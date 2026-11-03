// Dobles de los puertos (repositorios) para las pruebas: guardan con qué alcance los llamaron.
import type { CategoryRow } from "@mirai/contracts/modules/catalogs"
import type { PlanRow, RawAppContext } from "@mirai/domain/app-context"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import type { DbScope, UserScope } from "../../src/core/db/scope"
import { CatalogsRepo, type ListCategories } from "../../src/modules/catalogs/catalogs.repository"
import { categories, rawFor } from "./fixtures"

export class FakeAppContextRepo extends AppContextRepo {
  loads: UserScope[] = []
  constructor(private readonly src: (userId: string) => RawAppContext = rawFor) {
    super()
  }
  async load(scope: UserScope) {
    this.loads.push(scope)
    return this.src(scope.userId)
  }
  async planOf(): Promise<PlanRow> {
    return null
  }
}

export class FakeCatalogsRepo extends CatalogsRepo {
  calls: { scope: DbScope; q: ListCategories }[] = []
  async listCategories(scope: DbScope, q: ListCategories): Promise<CategoryRow[]> {
    this.calls.push({ scope, q })
    // Como la consulta real: solo ese libro, sin borradas, orden por sort.
    return categories(q.bookId).filter((c) => !q.grupo || c.grupo === q.grupo).sort((a, b) => a.sort - b.sort)
  }
}
