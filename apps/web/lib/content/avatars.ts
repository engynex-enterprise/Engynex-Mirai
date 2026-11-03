// Avatares de Mirai (estilo perfiles de Netflix): personajes amables sobre un fondo de color, por categorías.
// viewBox 0 0 120 120. En profiles.avatar_url y family_members.avatar se guardan como "mirai:<clave>":
// NUNCA cambies ni borres una clave existente (los perfiles guardados dejarían de mostrar su avatar).
// Cada categoría vive en lib/content/avatars/<categoría>.ts; las piezas comunes en lib/content/avatars/kit.ts.

import { ABSTRACTO } from "./avatars/abstracto"
import { ANIMALES } from "./avatars/animales"
import { CARITAS } from "./avatars/caritas"
import { COMIDA } from "./avatars/comida"
import { DEPORTES } from "./avatars/deportes"
import { FINANCIERO } from "./avatars/financiero"
import { GAMER } from "./avatars/gamer"
import { HOGAR } from "./avatars/hogar"
import { INFANTIL } from "./avatars/infantil"
import { AVATAR_CATS, type AvatarCat, type AvatarDef } from "./avatars/kit"
import { NATURALEZA } from "./avatars/naturaleza"
import { PERSONAS_AV } from "./avatars/personas"
import { VIAJES } from "./avatars/viajes"

export { AVATAR_CATS, type AvatarCat, type AvatarDef }

export const AVATARS: AvatarDef[] = [
  ...FINANCIERO, ...INFANTIL, ...ANIMALES, ...PERSONAS_AV, ...CARITAS, ...ABSTRACTO,
  ...COMIDA, ...NATURALEZA, ...DEPORTES, ...VIAJES, ...HOGAR, ...GAMER,
]

export const AVATAR_BY_KEY: Record<string, AvatarDef> = Object.fromEntries(AVATARS.map((a) => [a.k, a]))
export const MIRAI_PREFIX = "mirai:"
export const miraiAvatar = (src: string | null | undefined) => (src?.startsWith(MIRAI_PREFIX) ? AVATAR_BY_KEY[src.slice(MIRAI_PREFIX.length)] ?? null : null)

/** Cuántos avatares hay en cada categoría. */
export const AVATAR_COUNT = Object.fromEntries(AVATAR_CATS.map((c) => [c.id, AVATARS.filter((a) => a.c === c.id).length])) as Record<AvatarCat, number>
