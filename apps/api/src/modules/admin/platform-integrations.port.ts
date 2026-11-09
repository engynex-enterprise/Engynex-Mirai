// Puerto de las llamadas EXTERNAS de la consola › Integraciones globales y WhatsApp (V7-G): probar la conexión con el
// proveedor, enviar pruebas y leer/armar plantillas de Meta. Lo que se guarda (platform_integrations, admin_audit,
// notification_log) lo hace el servicio con RowStore; aquí solo va la red. Adaptador real: @mirai/services y
// @mirai/ai (el mismo código que la web). En las pruebas, un doble sin red.
import type { IntegrationDef } from "@mirai/services/integrations/registry"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import type { TemplateDraft } from "@mirai/services/notify/wa-templates"

export type ParamPreview = { key: string; label: string; value: string; src: string }
export type WaCaseOverride = { template?: string; lang?: string; map?: Record<string, unknown>; headerImage?: string }

export abstract class PlatformIntegrationsPort {
  /** ¿Existe la variable de entorno del registro (`def.env`) en este despliegue? */
  abstract hasEnv(name: string): boolean
  /** Valor de una variable del despliegue, para armar la integración que viene del servidor (integrationFromEnv). */
  abstract envValue(name: string): string | undefined
  /** Dirección pública del sitio (enlaces de WhatsApp) e imagen de marca por defecto de los encabezados. */
  abstract publicSiteUrl(): string
  abstract defaultHeaderImage(): string
  /**
   * Prueba la integración: IA (una respuesta corta), correo (te envía uno a `adminEmail`), Telegram, WhatsApp (número
   * y plantilla), datos (una consulta). Devuelve el texto para la persona; si falla, lanza (el servicio usa errorMsg).
   */
  abstract test(v: IntegrationValue, def: IntegrationDef, adminEmail: string): Promise<{ msg: string; ref?: string | null }>
  /** Texto legible de un error del proveedor (aiErrMsg de @mirai/ai). */
  abstract errorMsg(e: unknown, url?: string): string
  /** Idioma de la plantilla por defecto leída de Meta (null si no hay). */
  abstract templateLang(v: IntegrationValue): Promise<string | null>
  /** Envío de prueba real por correo o WhatsApp (`dest` ya validado). */
  abstract sendTest(v: IntegrationValue, channel: "email" | "whatsapp", dest: string, nombre: string): Promise<{ msg: string; ref: string | null }>
  /** Plantillas de la cuenta de WhatsApp Business (en vivo; `fresh` sin caché) y el número conectado. */
  abstract waTemplates(v: IntegrationValue, fresh: boolean): Promise<Record<string, unknown>[]>
  abstract waNumber(v: IntegrationValue): Promise<string | undefined>
  abstract waPreview(v: IntegrationValue, caso: string, override?: WaCaseOverride): Promise<{ preview: ParamPreview[]; template: string }>
  abstract waSend(v: IntegrationValue, dest: string, caso: string, override: WaCaseOverride | undefined, nombre: string): Promise<{ msg: string; ref: string | null; preview: ParamPreview[] }>
  /** V7-H3: plantillas en la cuenta de Meta (crear queda en revisión; editar solo componentes y categoría; borrar el nombre o una traducción). */
  abstract waCreateTemplate(v: IntegrationValue, draft: TemplateDraft): Promise<{ id: string; status?: string }>
  abstract waEditTemplate(v: IntegrationValue, templateId: string, draft: TemplateDraft): Promise<void>
  abstract waDeleteTemplate(v: IntegrationValue, name: string, templateId?: string): Promise<void>
}
