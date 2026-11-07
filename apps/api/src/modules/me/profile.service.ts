// Perfil, preferencias, libro activo y lo público de la plataforma (V7-G: E2, E19, E24, E25). Los consentimientos
// (E17) son del frente de auth (packages/contracts/src/modules/auth.ts).
// Con la sesión de la persona (UserScope): las políticas "perfil propio" y "preferencias propias" vuelven a revisar
// que solo toque lo suyo. Lo de la plataforma se lee con SystemScope y solo las columnas que ya son públicas (aviso, modo y planes de las integraciones encendidas).
import { Injectable } from "@nestjs/common"
import { type Preferences, type PreferencesPatch, type Profile, type ProfilePatch } from "@mirai/contracts/modules/me"
import { findBook } from "@mirai/domain/app-context"
import { AppContextService } from "../../core/context/app-context.service"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { RowStore, type Rec } from "../../core/store/row-store"

/** Dígitos de un documento y los 2 últimos que usa la DIAN (digitosDian de apps/web/lib/format.ts). */
export const digitosDian = (doc: string) => {
  const d = doc.replace(/\D/g, "")
  return d.length >= 2 ? d.slice(-2) : ""
}

/** Valores por defecto de user_preferences (los de la tabla), para quien aún no tiene fila. */
export const DEFAULT_PREFS = (userId: string): Preferences => ({
  user_id: userId, theme: "system", font_scale: "m", dense: false, reduce_motion: false, sidebar_collapsed: false, home_view: "inicio",
  privacy_mode: false, privacy_blur_on_leave: false, lock_minutes: 0, nav_open: {}, chat_pos: null, calendar_prefs: {}, tour_done: false,
  seen_release: null, extra: {}, updated_at: null,
})

const TONOS = new Set(["info", "warn", "ok"])

@Injectable()
export class ProfileService {
  constructor(
    private readonly rows: RowStore,
    private readonly ctx: RequestContextService,
    private readonly contexts: AppContextService,
  ) {}

  private get scope() {
    return this.ctx.db
  }
  private get uid() {
    return this.ctx.user.id
  }

  async profile(): Promise<Profile> {
    const p = await this.rows.first<Profile>(this.scope, "profiles", { eq: { id: this.uid } })
    if (!p) throw DomainError.notFound("No encontramos tu perfil.")
    return p
  }

  async updateProfile(patch: ProfilePatch): Promise<Profile> {
    const p: Rec = { ...patch }
    if (typeof p.nombre === "string") p.nombre = p.nombre.trim()
    if (typeof p.apodo === "string") p.apodo = p.apodo.trim()
    // Con cédula (CC) los dígitos DIAN salen solo del documento (CLAUDE.md › Avatares y digitos).
    if (patch.doc !== undefined || patch.doc_tipo !== undefined || patch.digitos !== undefined) {
      const cur = patch.doc === undefined || patch.doc_tipo === undefined ? await this.profile() : null
      const tipo = patch.doc_tipo ?? cur?.doc_tipo
      const doc = patch.doc ?? cur?.doc ?? ""
      if (tipo === "CC") p.digitos = digitosDian(doc)
    }
    // Si se cambia la dirección, la ciudad del perfil la acompaña (como profile-view.tsx).
    if (patch.direccion && patch.ciudad === undefined && typeof patch.direccion.ciudad === "string") p.ciudad = patch.direccion.ciudad
    const [row] = await this.rows.update<Profile>(this.scope, "profiles", { eq: { id: this.uid } }, p)
    if (!row) throw DomainError.notFound("No encontramos tu perfil.")
    // El menú, el saludo y la presencia leen el perfil del contexto (GET /v1/me).
    if (["nombre", "apodo", "avatar_url", "nacimiento"].some((k) => k in patch)) this.contexts.invalidate(this.uid)
    return row
  }

  async preferences(): Promise<Preferences> {
    return (await this.rows.first<Preferences>(this.scope, "user_preferences", { eq: { user_id: this.uid } })) ?? DEFAULT_PREFS(this.uid)
  }

  async updatePreferences(patch: PreferencesPatch): Promise<Preferences> {
    const { extraPatch, ...rest } = patch
    const row: Rec = { ...rest, user_id: this.uid }
    if (extraPatch) {
      const cur = (await this.preferences()).extra
      const base = rest.extra ?? (cur && typeof cur === "object" && !Array.isArray(cur) ? (cur as Rec) : {})
      row.extra = { ...base, ...extraPatch }
    }
    const [saved] = await this.rows.upsert<Preferences>(this.scope, "user_preferences", [row], { onConflict: ["user_id"] })
    // La base devuelve la fila completa; los valores por defecto solo cubren una respuesta parcial.
    return { ...DEFAULT_PREFS(this.uid), ...(saved ?? (await this.preferences())) }
  }

  async setActiveBook(bookId: string): Promise<{ bookId: string }> {
    // Solo un libro de los hogares de la persona (el mismo chequeo de switchBook).
    if (!findBook(await this.contexts.raw(this.ctx.user), bookId)) throw DomainError.notFound("No encontramos ese libro.")
    await this.rows.update(this.scope, "profiles", { eq: { id: this.uid } }, { last_book_id: bookId })
    this.contexts.invalidate(this.uid)
    return { bookId }
  }

  async platformNotice(): Promise<{ aviso: string; tono: "info" | "warn" | "ok" }> {
    const s = await this.rows.first<{ aviso_global: string | null; aviso_tono: string | null }>(systemScope("aviso para todos (público)"), "platform_settings", { columns: ["aviso_global", "aviso_tono"] })
    const tono = TONOS.has(s?.aviso_tono ?? "") ? (s!.aviso_tono as "info" | "warn" | "ok") : "info"
    return { aviso: s?.aviso_global?.trim() ?? "", tono }
  }

  /** /ads.txt: el cliente de AdSense de Integraciones globales (solo `client`; nada más de la configuración). */
  async platformAdsense(): Promise<{ client: string | null }> {
    const r = await this.rows.first<{ modo: string | null; config: { client?: unknown } | null }>(systemScope("ads.txt (público)"), "platform_integrations", { columns: ["modo", "config"], eq: { kind: "adsense" } })
    const client = r && r.modo !== "apagada" && typeof r.config?.client === "string" ? r.config.client.trim() : ""
    return { client: client || null }
  }

  async platformIntegrations(): Promise<{ kind: string; modo: string; planes: string[] }[]> {
    // La vista ya deja fuera las apagadas y los secretos; aquí además solo salen modo y planes.
    const rows = await this.rows.select<{ kind: string | null; modo: string | null; planes: string[] | null }>(this.scope, "platform_integrations_public", { columns: ["kind", "modo", "planes"] })
    return rows.filter((r) => r.kind).map((r) => ({ kind: r.kind!, modo: r.modo ?? "opcional", planes: r.planes ?? [] }))
  }

  /** V7-H2: ¿tu chat de Telegram está vinculado? (TelegramLink de Ajustes › Alertas). Sin el id del chat. */
  async telegram(): Promise<{ linked: boolean; linked_at: string | null }> {
    const r = await this.rows.first<{ chat_id: string | number | null; linked_at: string | null }>(this.scope, "telegram_links", { columns: ["chat_id", "linked_at"], eq: { user_id: this.uid } })
    return { linked: !!r?.chat_id, linked_at: r?.chat_id ? (r.linked_at ?? null) : null }
  }
}
