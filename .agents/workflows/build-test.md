# Build y pruebas

1. `npm run build` → genera `dist/mirai.html`, `dist/app.check.js` y `server/public/index.html`, y valida la sintaxis con `node --check`.
   - Si falla con `Identifier 'x' has already been declared`: todo el JS comparte un solo scope; renombra la variable nueva.
2. `npm test` → corre `tests/run-all.js` (19 pruebas). Una prueba pasa si termina con código 0 e imprime `[]` (sin errores de página).
   - `npm run test:one <prefijo>` para una sola (ej. `dian`, `gam`, `cal`).
   - La prueba `dian` levanta el servidor Express en :8099 con almacenamiento en archivo.
3. Revisa las capturas en `tests/.out/*.png` cuando cambies interfaz (escritorio 1366 px y móvil 400 px).
4. Servidor: `cd server && node --check lib/core.js lib/store.js`.
