# Backlog y limitaciones conocidas

## Prioridad alta (siguiente gran paso)
- **Cuentas de usuario y sincronización multi-dispositivo fuera de claude.ai.** Hoy los datos viven en el `localStorage` del navegador. Propuesta: Supabase Auth (correo + enlace mágico o Google) y tabla `mirai_libros` con el estado `S` cifrado por usuario (o normalizado por tablas), con RLS por `auth.uid()`. Migrar el `MIRAI_TOKEN` único a sesiones por usuario y permitir varios hogares por despliegue.
- **Respaldo automático** en el servidor (versiones diarias del libro) y restauración.
- **Calendario DIAN 2027** (año gravable 2026): actualizar `RENTA26` → `RENTA27` cuando la DIAN lo publique (normalmente en diciembre/enero).

## DIAN / renta
- Rentas no laborales y de capital con su propia depuración; dividendos (cédula de dividendos); ganancias ocasionales (venta de bienes, herencias); pensiones con su cédula completa.
- Anticipo de renta para el año siguiente; renta presuntiva (0 % vigente); pérdidas fiscales; régimen SIMPLE.
- Generar borrador del **formulario 210** con renglones oficiales y exportar en el formato que pide el contador.
- Adjuntar archivos (certificados en PDF/foto) a cada documento de la lista, cifrados, visibles para el contador.
- Exógena: importar la información reportada por terceros (cuando el usuario descargue el archivo de la DIAN).
- Excel real `.xlsx` (hoy SpreadsheetML `.xls` con aviso de Excel).

## Calendario e impuestos locales
- Predial y vehicular por ciudad (hoy aproximaciones Bogotá: 7 por mil y 1,5 %/2,5 %/3,5 %). Permitir elegir ciudad y tarifa.
- SOAT: tabla de referencia por tipo de vehículo y cilindraje.

## Notificaciones e integraciones
- Plantillas de correo HTML con la marca Mirai.
- WhatsApp: más de una plantilla (resumen, recordatorio puntual).
- Push del navegador (PWA) con service worker; instalar como app.

## Técnico
- `iso/gen.py` desincronizado de `iso/iso.json` (isotipos `logros` y `contador` agregados a mano).
- Dividir `a_shell.html` (CSS) en hojas por módulo dentro del build.
- Pruebas unitarias para cálculos puros (`calcRenta`, `engine`, `dedCalc`, `calEst`) con `node:test`.
- Lint/format (ESLint + Prettier) sin romper el estilo compacto existente.
- Accesibilidad: auditoría con axe en las pruebas.

## Producto (ideas)
- Gamificación: retos familiares compartidos y logros por miembro.
- Modo negocio (libros separados ya existen: mejorar reportes para independientes y facturación).
