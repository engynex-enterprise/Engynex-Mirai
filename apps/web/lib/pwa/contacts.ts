// Contact Picker (Chrome en Android): escoger una persona de los contactos del celular para llenar un formulario.
// Mirai solo recibe el contacto que la persona escoge, nunca la libreta completa.

export type PickedContact = { nombre: string; telefono: string; email: string }
type ContactsManager = { select: (props: string[], o?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[]; email?: string[] }[]> }

export const contactPickerSupported = () =>
  typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window

/** Celular colombiano sin indicativo ni espacios: "+57 300 123 4567" → "3001234567". */
export function normalizeTel(t: string): string {
  let d = (t ?? "").replace(/[^\d+]/g, "")
  if (d.startsWith("+57")) d = d.slice(3)
  else if (d.startsWith("0057")) d = d.slice(4)
  else if (d.startsWith("57") && d.length === 12) d = d.slice(2)
  return d.replace(/\D/g, "")
}

/** Abre la lista de contactos del celular. null si la persona cancela. */
export async function pickContact(): Promise<PickedContact | null> {
  const cm = (navigator as Navigator & { contacts?: ContactsManager }).contacts
  if (!cm) return null
  const [c] = await cm.select(["name", "tel", "email"], { multiple: false })
  if (!c) return null
  return { nombre: (c.name?.[0] ?? "").trim(), telefono: normalizeTel(c.tel?.[0] ?? ""), email: (c.email?.[0] ?? "").trim() }
}
