# Agregar una funcionalidad

1. **Entiende el pedido** pensando en una persona sin conocimientos financieros. Si hay reglas de Colombia involucradas, verifícalas (subagente `finanzas-colombia`).
2. **Ubica el módulo** (tabla en `CLAUDE.md §3`). Si es grande y nuevo, crea `src/<letra>_<nombre>.js` y agrégalo a `ORDER` en `build.py` antes de `z_boot.js`.
3. **Implementa con los patrones existentes**: `V.vista`, `M.modal` + `EXTRA_FORM`, `EXTRA_ACT`, `data-edit`/`data-x`. Para cambiar comportamiento existente, envuelve la función en vez de reescribirla.
4. **Menú**: modifica `MENU` al cargar el módulo (ver cómo lo hace `s_dian.js`). Isotipo nuevo → agrégalo a `iso/iso.json` (y a `gen.py` si lo usas).
5. **Ayuda y textos**: `HELP.vista`, `MDESC.modal`, `tip`/`hint` en cada campo, estados vacíos con acción.
6. **Estilos**: bloque CSS al final de `src/a_shell.html`; verifica modo oscuro y 400 px.
7. **Prueba E2E** en `tests/e2e/<nombre>.test.js` (copia una existente; usa `require('../helpers.js')`, `sample()` y termina con `console.log(errs)`).
8. `npm test` en verde + revisar capturas.
9. **Release**: entrada en `RELEASES` y, si aplica, `FAQ` (ver `release.md`).
