---
description: Corre las pruebas E2E (todas o una) y revisa capturas
argument-hint: "[prefijo de prueba, ej. dian]"
---
1. `npm run build`.
2. Si hay argumento: `npm run test:one $ARGUMENTS`; si no: `node tests/run-all.js`.
3. Para cada prueba fallida, ábrela en `tests/e2e/`, revisa la salida y las capturas de `tests/.out/` (léelas como imagen) y corrige la causa en `src/` (no la prueba, salvo que la prueba esté desactualizada por un cambio pedido).
4. Resume en español qué pasó y qué corregiste.
