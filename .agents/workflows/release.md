# Publicar una versión

1. Sube `APP_VER` en `src/k_ayuda.js` (ej. `'4.1'`).
2. Agrega al inicio de `RELEASES` un objeto `{v, f:'dd mmm aaaa', t:'Título corto', items:[['new'|'imp'|'fix','Título','Descripción simple']]}`. Escribe para el usuario final, no para desarrolladores.
3. Agrega preguntas a `FAQ` si la funcionalidad genera dudas.
4. Regenera `CHANGELOG.md`: `node scripts/changelog.js`.
5. Sube `version` en `package.json` (y en `server/package.json` + `VERSION` en `server/lib/core.js` si cambió el servidor).
6. `npm test` en verde.
7. Si cambió el esquema: actualiza `server/supabase/schema.sql` (idempotente, con `if not exists`) y avisa que hay que re-ejecutarlo.
8. Despliega (ver `deploy-vercel.md`).
