---
description: Cierra una versión (APP_VER, RELEASES, FAQ, CHANGELOG)
argument-hint: "<versión, ej. 4.1>"
---
Sigue `.agents/workflows/release.md` para la versión $ARGUMENTS. Revisa `git log` desde la última versión para no olvidar cambios. Escribe las notas para el usuario final, en español simple. Al final corre `npm test` y `node scripts/changelog.js`.
