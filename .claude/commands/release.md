---
description: Cierra una versión (APP_VER, novedades y FAQ del centro de ayuda)
argument-hint: "<versión, ej. 5.6>"
---
Versión $ARGUMENTS:
1. Revisa `git log` desde la última versión para no olvidar cambios.
2. En `apps/web/lib/content/ayuda.ts`: sube `APP_VER` y agrega el `Release` nuevo (`v`, fecha, título, `items` con
   `new`/`imp`/`fix`) escrito para el usuario final, en español simple y con ejemplos en pesos cuando ayude. Las versiones
   anteriores no se tocan. Actualiza las preguntas frecuentes que cambien.
3. Anota el resumen técnico en `docs/HISTORIAL.md`.
4. Pide al subagente `ux-simple` que revise los textos. Corre `pnpm test` y `pnpm e2e:local -- ayuda` (o la batería si cambió algo más).
5. Para publicar: `/deploy`.
