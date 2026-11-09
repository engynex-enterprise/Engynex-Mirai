// Portadas del perfil: escenas ilustradas por categoría, colores lisos y la foto que suba cada persona.
// Se guardan en profiles.portada: "verde" (color), "art:<clave>" (escena) o una URL (foto subida).
// Las claves no se renombran: una portada guardada seguiría apuntando a ellas.

import { BANNER_THEMES, type BannerThemeKey } from "./banners"

export const ART_PREFIX = "art:"

export type CoverCat = "naturaleza" | "ciudad" | "viaje" | "plata" | "familia" | "figuras"
export type CoverMotif =
  | "montanas" | "playa" | "bosque" | "nubes" | "campo"
  | "ciudad" | "barrio" | "puente"
  | "avion" | "carretera" | "mapa"
  | "monedas" | "alcancia" | "casa" | "cosecha"
  | "familia" | "mascotas" | "corazones"
  | "olas" | "burbujas" | "confeti" | "geo"

export type CoverDef = { k: string; n: string; c: CoverCat; t: BannerThemeKey; m: CoverMotif }

export const COVER_CATS: { id: CoverCat; label: string }[] = [
  { id: "naturaleza", label: "Naturaleza" },
  { id: "ciudad", label: "Ciudad" },
  { id: "viaje", label: "Viaje" },
  { id: "plata", label: "Tu plata" },
  { id: "familia", label: "Familia" },
  { id: "figuras", label: "Formas y color" },
]

/** Catálogo de portadas ilustradas (clave estable → nombre, categoría, color y escena). */
export const COVERS: CoverDef[] = [
  // Naturaleza
  { k: "amanecer", n: "Amanecer en la montaña", c: "naturaleza", t: "naranja", m: "montanas" },
  { k: "montana-azul", n: "Montañas al atardecer", c: "naturaleza", t: "morado", m: "montanas" },
  { k: "playa", n: "Playa", c: "naturaleza", t: "cyan", m: "playa" },
  { k: "bosque", n: "Bosque", c: "naturaleza", t: "verde", m: "bosque" },
  { k: "cielo", n: "Cielo despejado", c: "naturaleza", t: "azul", m: "nubes" },
  { k: "campo", n: "Campo", c: "naturaleza", t: "menta", m: "campo" },
  // Ciudad
  { k: "ciudad-noche", n: "Ciudad de noche", c: "ciudad", t: "navy", m: "ciudad" },
  { k: "ciudad-dia", n: "Ciudad de día", c: "ciudad", t: "cyan", m: "ciudad" },
  { k: "barrio", n: "Tu barrio", c: "ciudad", t: "amarillo", m: "barrio" },
  { k: "puente", n: "Puente", c: "ciudad", t: "teal", m: "puente" },
  // Viaje
  { k: "avion", n: "De viaje", c: "viaje", t: "azul", m: "avion" },
  { k: "carretera", n: "Carretera", c: "viaje", t: "naranja", m: "carretera" },
  { k: "mapa", n: "Mapa", c: "viaje", t: "lavanda", m: "mapa" },
  // Tu plata
  { k: "ahorro", n: "Tus ahorros crecen", c: "plata", t: "verde", m: "monedas" },
  { k: "alcancia", n: "Alcancía", c: "plata", t: "rosa", m: "alcancia" },
  { k: "casa-propia", n: "Casa propia", c: "plata", t: "teal", m: "casa" },
  { k: "cosecha", n: "Siembra y cosecha", c: "plata", t: "menta", m: "cosecha" },
  // Familia
  { k: "familia", n: "En familia", c: "familia", t: "amarillo", m: "familia" },
  { k: "mascotas", n: "Mascotas", c: "familia", t: "naranja", m: "mascotas" },
  { k: "corazones", n: "Con cariño", c: "familia", t: "rosa", m: "corazones" },
  // Figuras
  { k: "olas", n: "Olas", c: "figuras", t: "teal", m: "olas" },
  { k: "burbujas", n: "Burbujas", c: "figuras", t: "lavanda", m: "burbujas" },
  { k: "confeti", n: "Confeti", c: "figuras", t: "morado", m: "confeti" },
  { k: "puntos", n: "Lunares", c: "figuras", t: "verde", m: "geo" },
]

export const COVER_BY_KEY = Object.fromEntries(COVERS.map((c) => [c.k, c])) as Record<string, CoverDef>
export const COVER_COUNT = COVER_CATS.reduce((a, c) => ({ ...a, [c.id]: COVERS.filter((x) => x.c === c.id).length }), {} as Record<CoverCat, number>)

/** Portada ilustrada guardada ("art:<clave>") o null si es un color o una foto. */
export const coverArt = (v: string | null | undefined): CoverDef | null =>
  v?.startsWith(ART_PREFIX) ? (COVER_BY_KEY[v.slice(ART_PREFIX.length)] ?? null) : null

/** ¿El valor guardado es una foto subida? */
export const coverFoto = (v: string | null | undefined): string | null => (v && /^https?:\/\//.test(v) ? v : null)

/** Color de la portada cuando no es escena ni foto (compatibilidad con los 11 colores de antes). */
export const coverColor = (v: string | null | undefined): BannerThemeKey =>
  v && v in BANNER_THEMES ? (v as BannerThemeKey) : "verde"
