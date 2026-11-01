# Backlog y limitaciones conocidas (v5.0)

## Hecho en la v5 (antes en este backlog)
Cuentas y sincronización multi-dispositivo (Supabase Auth + hogares con roles) · respaldos en la nube y restauración · adjuntos de certificados DIAN visibles para el contador · Excel `.xlsx` real · plantillas de correo con la marca · push del navegador (PWA) · pruebas unitarias de los cálculos (más de 1.170, comparadas con la v4) · lint con ESLint.

## Configuración pendiente del despliegue (no es código)
- Registrar tarjeta en Vercel para que funcione el **AI Gateway** (hoy responde 403). Mientras tanto, activa Gemini o Groq (gratis) en Ajustes › Integraciones.
- Google Cloud: URI `…/api/google/callback`, habilitar Gmail API y Calendar API (ver `docs/DEPLOY-VERCEL.md`).
- Supabase: programar el cron horario (`select mirai_schedule_notify(...)`), SMTP propio, Turnstile si se usa.
- Cambiar la contraseña temporal de la base de datos (`SUPABASE_DB_URL`).

## DIAN / renta
- Rentas no laborales y de capital con su propia depuración; dividendos; ganancias ocasionales; pensiones con cédula completa.
- Anticipo de renta, pérdidas fiscales, régimen SIMPLE.
- Borrador del formulario 210 con renglones oficiales.
- Exógena: importar lo reportado por terceros.
- Calendario DIAN del año gravable 2026 (se declara en 2027) cuando la DIAN lo publique; UVT 2027.
- Paridad pendiente de verificar con `finanzas-colombia` (ver `lib/domain/NOTAS.md`): retención 40 %/1.340 UVT en nómina, tope IBC 25 SMMLV, ingresos anuales en el flujo.

## Calendario e impuestos locales
- Predial y vehicular por ciudad (hoy aproximaciones Bogotá). SOAT por tipo y cilindraje.

## Notificaciones e integraciones
- WhatsApp: más de una plantilla; modo "abrir WhatsApp con el resumen" (wa.me) además de la API.
- Webhook de Telegram (hoy la vinculación usa `getUpdates`).

## Producto
- Retos familiares compartidos y logros por miembro.
- Modo negocio: reportes para independientes y facturación.
- Auditoría de accesibilidad con axe en las pruebas.
