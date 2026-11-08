---
description: Corre las pruebas (Vitest y la batería E2E local) y revisa capturas
argument-hint: "[archivo o patrón de prueba E2E, ej. f1-gastos]"
---
1. `pnpm test` (Vitest de todos los paquetes).
2. E2E contra Docker local (nunca producción): con argumento `pnpm e2e:local -- $ARGUMENTS`; sin argumento `pnpm e2e:local`
   (toda la batería, escritorio 1366 px y celular 400 px; no lances dos a la vez). `--no-build` reusa la última compilación.
3. Para cada prueba fallida: lee `apps/web/tests/e2e/<archivo>`, la salida y las capturas de `apps/web/tests/.out/` (como imagen)
   y corrige la causa en el código (no la prueba, salvo que un cambio pedido la dejó desactualizada). Una que falla y pasa
   al repetirla es intermitente: dilo.
4. Resume en español qué pasó y qué corregiste.
