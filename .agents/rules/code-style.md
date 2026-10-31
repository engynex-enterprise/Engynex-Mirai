# Estilo de código

- JavaScript moderno (ES2022) sin transpilar; debe correr en Chrome, Safari y Firefox actuales y en móviles.
- El código existente es compacto (líneas largas, plantillas inline). Sigue el estilo del archivo que tocas; en código nuevo prioriza legibilidad razonable.
- Funciones que otros módulos pueden envolver: decláralas con `function nombre(){}` (reasignables). Para extender: `const _x = x; x = function(...a){ const r = _x.apply(this, a); …; return r }`.
- Escapa SIEMPRE lo que viene del usuario al meterlo en HTML: `esc()`.
- Dinero: `$(n)` formatea COP; `parseMoney()` lee inputs `money()`. Fechas: `iso(d)`, `parse(s)`, `fdate(d)`, `today()`, `addDays`, `addMonths`, `days(a,b)`.
- Nada de `alert/confirm/prompt` nuevos: usa modales (`M.*`), `toast()` y el flujo de confirmación existente.
- Un archivo por módulo funcional grande. Si creas uno nuevo: agrégalo a `ORDER` en `build.py` (antes de `z_boot.js`) y documéntalo en `CLAUDE.md §3`.
- CSS: agrégalo en `src/a_shell.html` en un bloque comentado (`/* nombre */`) antes de `</style>`. Usa variables (`--ink`, `--muted`, `--line`, `--line-2`, `--card`, `--bg`) para que funcione el modo oscuro.
- Servidor: ESM, Node ≥ 20, sin frameworks extra (Express solo en modo VPS). Errores al cliente en español.
