// Administración de plantillas en la cuenta de WhatsApp Business (crear, editar, eliminar y subir el ejemplo de la
// imagen del encabezado con la Resumable Upload API). Solo servidor (web y API, V7-H3); el token nunca sale de aquí.
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { IntegrationValue } from "../integrations/store"
import { rt } from "../runtime"
import { GRAPH, WA_DEFAULT_HEADER, clearTemplateCache, graph } from "./channels"
import { draftComponents, draftToMeta, type TemplateDraft } from "./wa-templates"
import { waErrorMsg } from "./whatsapp"

const waba = (v: IntegrationValue) => {
  const id = String(v.config.wabaId ?? "").trim()
  if (!id || !v.secrets.token) throw new Error("Falta el ID de la cuenta de WhatsApp Business o el token (consola › Integraciones globales › WhatsApp).")
  return id
}

/** ID de la app de Meta dueña del token (lo pide la Resumable Upload API). */
async function appId(v: IntegrationValue) {
  if (v.config.appId) return String(v.config.appId)
  const r = await graph<{ id?: string }>(v.secrets.token, "app")
  if (!r.id) throw new Error("No pudimos saber el ID de la app de Meta del token.")
  return r.id
}

const hostOf = (x: unknown) => {
  try {
    return [new URL(String(x)).host]
  } catch {
    return []
  }
}

/** Hosts propios de Mirai: el sitio y el almacenamiento de archivos (Supabase, CDN pública o S3). */
function ownHosts() {
  const r = rt()
  return [r.env("NEXT_PUBLIC_SUPABASE_URL"), r.env("SUPABASE_URL"), r.env("PUBLIC_FILES_URL"), r.env("S3_PUBLIC_ENDPOINT"), r.siteUrl(), r.publicSiteUrl()].filter(Boolean).flatMap(hostOf)
}

/** Hosts desde los que el servidor acepta descargar la imagen del ejemplo (evita pedir URLs arbitrarias). */
export function allowedHost(u: URL) {
  return ownHosts().includes(u.host) || /(^|\.)whatsapp\.net$|(^|\.)fbcdn\.net$/.test(u.hostname)
}

/** Lee la imagen (de Storage, de Mirai o del ejemplo que guardó Meta). La imagen de marca se lee del disco si está. */
async function imageBytes(url: string): Promise<{ bytes: Buffer; type: string; name: string }> {
  const u = new URL(url)
  const site = [rt().siteUrl(), rt().publicSiteUrl()].flatMap(hostOf)
  if (u.pathname === WA_DEFAULT_HEADER && site.includes(u.host)) {
    const disk = await readFile(path.join(process.cwd(), "public", WA_DEFAULT_HEADER)).catch(() => null)
    if (disk) return { bytes: disk, type: "image/png", name: "whatsapp-header.png" }
  }
  if (u.protocol !== "https:" || !allowedHost(u)) throw new Error("La imagen debe estar en el almacenamiento de Mirai (súbela desde la consola).")
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`No pudimos descargar la imagen (HTTP ${r.status}). Súbela de nuevo.`)
  const type = (r.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!["image/png", "image/jpeg"].includes(type)) throw new Error("La imagen del encabezado debe ser JPG o PNG.")
  const bytes = Buffer.from(await r.arrayBuffer())
  if (bytes.length > 5 * 1024 * 1024) throw new Error("La imagen pesa más de 5 MB.")
  return { bytes, type, name: path.basename(u.pathname) || "header" }
}

/** Sube la imagen de ejemplo con la Resumable Upload API y devuelve el `header_handle` para la plantilla. */
export async function uploadHeaderExample(v: IntegrationValue, url: string) {
  const { bytes, type, name } = await imageBytes(url)
  const app = await appId(v)
  const s = await graph<{ id?: string }>(v.secrets.token, `${app}/uploads?file_name=${encodeURIComponent(name)}&file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`, {})
  if (!s.id) throw new Error("Meta no abrió la sesión de subida.")
  const r = await fetch(`${GRAPH}/${s.id}`, { method: "POST", headers: { authorization: `OAuth ${v.secrets.token}`, file_offset: "0" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(30000) })
  const j = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }))
  if (j.error || !j.h) throw new Error(`WhatsApp: ${waErrorMsg(j.error ?? { message: "Meta no devolvió el identificador de la imagen" })}`)
  return String(j.h)
}

/** Crea la plantilla en Meta (queda en revisión). Devuelve id y estado. */
export async function createTemplate(v: IntegrationValue, d: TemplateDraft) {
  const id = waba(v)
  const handle = d.header.type === "image" ? await uploadHeaderExample(v, d.header.url) : undefined
  const r = await graph<{ id: string; status?: string; category?: string }>(v.secrets.token, `${id}/message_templates`, draftToMeta(d, handle))
  clearTemplateCache()
  return r
}

/** Edita una plantilla (Meta solo deja cambiar componentes y categoría; nombre e idioma no). */
export async function editTemplate(v: IntegrationValue, templateId: string, d: TemplateDraft) {
  waba(v)
  const handle = d.header.type === "image" ? await uploadHeaderExample(v, d.header.url) : undefined
  const r = await graph<{ success?: boolean }>(v.secrets.token, encodeURIComponent(templateId), { category: d.category, components: draftComponents(d, handle) })
  clearTemplateCache()
  return r
}

/** Elimina una plantilla (todas sus traducciones si no se da el id; solo esa si se da `hsm_id`). */
export async function deleteTemplate(v: IntegrationValue, name: string, templateId?: string) {
  const id = waba(v)
  const r = await graph<{ success?: boolean }>(v.secrets.token, `${id}/message_templates?name=${encodeURIComponent(name)}${templateId ? `&hsm_id=${encodeURIComponent(templateId)}` : ""}`, undefined, "DELETE")
  clearTemplateCache()
  return r
}
