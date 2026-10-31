---
description: Implementa una funcionalidad nueva siguiendo el flujo de Mirai
argument-hint: "<descripción de la funcionalidad>"
---
Funcionalidad pedida: $ARGUMENTS

Sigue `.agents/workflows/add-feature.md` paso a paso:
1. Resume en 2-3 líneas qué entendiste y qué módulos vas a tocar.
2. Si hay reglas tributarias o laborales de Colombia, consulta al subagente `finanzas-colombia` antes de implementar.
3. Implementa con los patrones del proyecto (V/M/EXTRA_*), con ayudas (HELP, MDESC, tips) y CSS con modo oscuro.
4. Crea la prueba E2E y corre `npm test`.
5. Pide al subagente `ux-simple` que revise los textos y al subagente `qa-playwright` que revise capturas en 1366 y 400 px.
6. Agrega la entrada de RELEASES/FAQ y regenera el changelog.
7. Responde en español, breve, sin jerga.
