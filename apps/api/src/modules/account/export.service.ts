// Exportar mis datos (V7-G, Ley 1581: derecho de acceso). Mismo resultado que exportMyData de
// apps/web/features/data/actions.ts: perfil, preferencias, consentimientos, hogares, reglas de aviso, dispositivos
// push, Telegram y los libros. Libros completos (BookDump v5, con la papelera) solo donde la persona es Dueño o
// Administra; en los demás, solo los gastos, ingresos e ingresos extra que registró. Como la web, lee con la clave del
// sistema (SystemScope con motivo) y siempre filtrado por la persona del token.
import { Injectable } from "@nestjs/common"
import type { MyDataExport } from "@mirai/contracts/modules/account"
import { toAccess } from "@mirai/domain/household/roles"
import { systemScope } from "../../core/db/scope"
import { RowStore } from "../../core/store/row-store"
import { HouseholdAccess } from "../households/household-access"
import { BookDumpService } from "../import/book-dump.service"

type Rec = Record<string, unknown>

@Injectable()
export class AccountExportService {
  constructor(
    private readonly rows: RowStore,
    private readonly dumps: BookDumpService,
    private readonly access: HouseholdAccess,
  ) {}

  async exportMyData(): Promise<MyDataExport> {
    const { user, raw } = await this.access.actor()
    const sys = systemScope("exportar mis datos (Ley 1581, supabaseAdmin en la web)")
    const mine = { eq: { user_id: user.id } }
    const [perfil, preferencias, consentimientos, hogares, avisos, push, telegram] = await Promise.all([
      this.rows.first<Rec>(sys, "profiles", { eq: { id: user.id } }),
      this.rows.first<Rec>(sys, "user_preferences", mine),
      this.rows.select<Rec>(sys, "consents", mine),
      this.rows.select<Rec>(sys, "household_members", { ...mine, columns: ["household_id", "role", "created_at"] }),
      this.rows.select<Rec>(sys, "notification_rules", mine),
      this.rows.select<Rec>(sys, "push_subscriptions", { ...mine, columns: ["user_agent", "created_at"] }),
      this.rows.first<Rec>(sys, "telegram_links", { ...mine, columns: ["linked_at"] }),
    ])
    const full = new Set(raw.households.filter((h) => ["owner", "admin"].includes(toAccess(h.access_role, h.role))).map((h) => h.id))
    const libros: Rec[] = []
    for (const b of raw.books) {
      const book = { id: b.id, household_id: b.household_id, nombre: b.nombre }
      libros.push(full.has(b.household_id) ? await this.dumps.dump(sys, book) : await this.dumps.ownRows(sys, book, user.id))
    }
    return {
      exportado: new Date().toISOString(),
      cuenta: { email: user.email },
      perfil, preferencias, consentimientos, hogares, avisos, dispositivos_push: push, telegram,
      libros,
    }
  }
}
