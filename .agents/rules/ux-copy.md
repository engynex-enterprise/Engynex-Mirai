# UX, diseño y textos

## Para quién
Personas y familias colombianas **sin conocimientos financieros**. El dueño del producto no sabe de tasas de interés: si él no lo entiende a la primera, hay que simplificarlo.

## Reglas
- Español de Colombia, tuteo, frases cortas. Ejemplos con pesos y situaciones reales ("pagué 120 mil de la luz").
- Términos técnicos siempre con explicación simple (tooltip `tip`, `hint` o texto al lado). Ej.: "UVT: unidad que usa la DIAN para fijar topes".
- Cada sección: `pageH()` con descripción + botón "Cómo funciona" (`HELP`). Cada modal: descripción (`MDESC`). Cada campo: ícono de información.
- Valores calculados: muestra **cómo se calcularon** y permite corregirlos. Marca "estimado" cuando lo sea.
- Confirmaciones con `toast()` (con "Deshacer" cuando se elimina algo).
- Estados vacíos útiles (`empty()` con botón de acción).
- Diseño Microsoft 365 / Fluent + shadcn: sidebar izquierda colapsable (Ctrl+B), sin header; miga de pan en el contenido; botón "Agregar" en el menú (atajo N); chat flotante arrastrable.
- Paleta Engynex: navy `#1F2B4B`, lima `#9EDB4E`, verde `#3F7A1E`. Modo oscuro obligatorio.
- Isotipos propios (iso/iso.json) para secciones; Lucide para íconos de interfaz. Logos de terceros (Google, Netflix, Telegram…) solo para identificar un servicio, sin modificarlos, desde `lib/brands.ts` (`scripts/brand-logos.mjs`: @iconify-json/logos y simple-icons, CC0; monograma si no hay logo libre). Nunca como decoración ni como logo de Mirai.
- Probar en 1366 px y 400 px. Sin scroll horizontal. Accesible: `aria-label` en botones de solo ícono, foco visible, respeta `prefers-reduced-motion`.
