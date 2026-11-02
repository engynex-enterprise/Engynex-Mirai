# Desplegar Mirai en Vercel

1. Importa el repositorio en Vercel (Framework: Next.js, Root Directory: raíz).
2. Carga las variables en **Settings › Environment Variables** con el tipo correcto:

| Variable | Tipo en Vercel | Por qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Config** | Pública por diseño (la usa el navegador). Si Vercel avisa "Remove the public framework prefix…", elige *change the variable to Config*. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Config** | Clave publicable: la seguridad la dan las reglas RLS. |
| `NEXT_PUBLIC_SITE_URL` | **Config** | URL pública de la app (p. ej. `https://mirai.tudominio.co`). |
| `NEXT_PUBLIC_LEGAL_OWNER`, `_NIT`, `_EMAIL`, `_CITY` | **Config** | Datos del responsable (Ley 1581) que se muestran en la política. |
| `SUPABASE_SECRET_KEY` | **Sensitive** | Salta RLS: solo servidor. |
| `ENCRYPTION_KEY` | **Sensitive** | Cifra las claves de integraciones. **No cambiarla nunca.** |
| `CRON_SECRET` | **Sensitive** | Protege `/api/cron/*`. |
| `GOOGLE_CLIENT_ID` | Config | |
| `GOOGLE_CLIENT_SECRET` | **Sensitive** | |
| `AI_GATEWAY_API_KEY` | **Sensitive** | Vercel AI Gateway (requiere tarjeta registrada en Vercel). |
| `SUPABASE_DB_URL` | — (no subir) | Solo para `npm run db:migrate` en local. |

Nunca pongas el prefijo `NEXT_PUBLIC_` a un secreto: todo lo que lo lleva se incluye en el JavaScript del navegador.

3. Supabase › Authentication › URL Configuration: *Site URL* = tu dominio; *Redirect URLs* = `https://tu-dominio/auth/callback` y `https://tu-dominio/auth/confirm` (y las de `http://localhost:3000` para desarrollo).
4. Supabase › Authentication › Providers › Google: Client ID y Secret. En Google Cloud, URI de redirección `https://ofcuvjixvtdixcwzdzqa.supabase.co/auth/v1/callback`.
5. Supabase › Authentication › SMTP: configura un SMTP propio (p. ej. Resend) para que lleguen los correos de confirmación y enlace mágico.
6. Speed Insights: pestaña *Speed Insights* › *Enable* (el componente solo se monta en Vercel).
7. **Variables adicionales** (todas opcionales salvo VAPID si quieres push):

| Variable | Tipo en Vercel | Para qué |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Config | Notificaciones push (Web Push). Se genera con `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | **Sensitive** | Pareja privada de la anterior. |
| `VAPID_SUBJECT` | Config | `mailto:` de contacto del despliegue. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Config | Captcha invisible de Cloudflare en login y registro. Pega la *secret key* en Supabase › Auth › Bot and Abuse Protection. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Config / **Sensitive** | Límite de consultas de IA por hogar y hora (también se puede configurar en consola › Integraciones globales). |
| `NEXT_PUBLIC_SENTRY_DSN` | Config | Reporte de errores con Sentry (solo se activa si existe). |

8. **Cron de avisos.** `vercel.json` ya programa `/api/cron/notify?daily=1` una vez al día (11:00 UTC = 6:00 a. m. Colombia); Vercel envía `Authorization: Bearer CRON_SECRET`. Para avisos a la hora exacta que elija cada persona, programa además el cron horario en Supabase (SQL Editor, una sola vez):
   ```sql
   select public.mirai_schedule_notify('https://tu-dominio', '<CRON_SECRET>');
   ```
   El mismo cron actualiza cada día la TRM, la tasa de usura y los festivos.
9. **Google (Gmail y Calendar).** En Google Cloud › Credenciales, al mismo cliente OAuth agrega la URI de redirección `https://tu-dominio/api/google/callback` (y `http://localhost:3000/api/google/callback` para desarrollo). Habilita *Gmail API* y *Google Calendar API* en el proyecto. Los permisos son `gmail.readonly` y `calendar.events`; mientras la app esté en modo "Prueba" en la pantalla de consentimiento, agrega los correos de prueba.
10. **Integraciones: quién configura qué (v5.5).** Los hogares solo configuran la **IA** (Ajustes › Inteligencia artificial: proveedor, clave propia y modelo; `?tab=integraciones` abre esa pestaña). Correo, WhatsApp, Telegram, push, datos (TRM, usura, festivos, monedas, cripto, acciones), Google, AdSense e infraestructura los configura **solo el administrador** en consola › Integraciones globales (`platform_integrations`, modo *Apagada* / *Activa* y planes). `getIntegration()` ignora la fila del hogar para esas (no se borra: queda en `integrations`). Sin fila global se usa la variable de entorno o, si el servicio no pide claves, queda disponible. Cada persona decide en Ajustes › Alertas si recibe avisos y por qué canal, y deja su correo, celular (se normaliza a +57) o vincula Telegram; ahí mismo tiene "Enviarme una prueba".
    - **Google:** Gmail (solo lectura) y Calendar son conexiones de la cuenta de cada persona (botón "Conectar con Google" en Correo del banco, OAuth con `GOOGLE_CLIENT_ID`). El administrador solo decide si el servicio está disponible; nadie pega claves.
    - **Telegram:** el administrador crea el bot de Mirai con @BotFather y pega el token en la consola; cada persona vincula su chat en Ajustes › Alertas (no requiere webhook).
    - **WhatsApp Cloud API:** en la consola pega el **Phone number ID** (WhatsApp › Configuración de la API; no es el ID de la app, de la empresa ni del usuario del sistema), el **ID de la cuenta de WhatsApp Business**, un token permanente de usuario del sistema con `whatsapp_business_messaging` y `whatsapp_business_management` y la cuenta asignada, y la plantilla (`mirai_resumen`). Al guardar, Mirai lee la plantilla aprobada (idioma y parámetros) y arma el mensaje con esa estructura (`lib/notify/whatsapp.ts`); sin el ID de la cuenta envía un solo parámetro con el resumen.
    - **Plantillas de WhatsApp (consola › WhatsApp, `/admin/whatsapp`):** lista las plantillas de la cuenta (estado, motivo de rechazo, vista previa), crea, edita y elimina plantillas en Meta (`lib/notify/wa-templates.ts` valida las reglas; `lib/notify/wa-meta.ts` sube el ejemplo de imagen con la Resumable Upload API usando el ID de la app del token) y asigna una plantilla por caso (resumen, pagos, cobros, presupuesto, hormiga, inversiones, metas, automatización, prueba) con el dato de Mirai de cada variable. Se guarda en `platform_integrations.config` (`template`, `lang` y `wa`). Al enviar, Mirai lee la plantilla real de Meta (caché de 10 min) y arma todos los componentes: encabezado de imagen/video/documento/texto, cuerpo y botones con parámetros. La imagen del encabezado es un enlace público: se sube al bucket público `public-assets/whatsapp/…` de Supabase (los *media id* de Meta vencen a los 30 días); sin imagen se usa `/brand/whatsapp-header.png` del sitio en https (`publicSiteUrl()`, nunca localhost; se regenera con `node scripts/whatsapp-header.mjs`).
    - **Pruebas y diagnóstico:** cada tarjeta tiene *Probar* (valida la cuenta) y, en correo y WhatsApp, *Enviar prueba* a un destino (funciona aunque esté apagada). Todos los intentos (resúmenes, pruebas, invitaciones, contador) quedan en consola › Registro de envíos (`notification_log`: canal, estado, destino enmascarado y error; sin el contenido).

## Ambientes: producción y pruebas

| | Producción | Pruebas |
|---|---|---|
| Rama de Git | `main` | `pruebas` |
| Dirección | https://mirai.engynex.com (`engynex-mirai.vercel.app` redirige aquí) | https://engynex-mirai-pruebas.vercel.app (solo con sesión en Vercel) |
| Ambiente de Vercel | Production | Preview (variables con rama `pruebas`) |
| Base de datos | Supabase "Engynex Mirai" | **La misma** por ahora (ver abajo) |
| Cron de avisos | Sí | No (Vercel solo corre crons en producción) |

**Flujo:** sube los cambios a `pruebas` → revisa en la dirección de pruebas → `git checkout main && git merge pruebas && git push` para publicar.

**Si producción no se actualiza** (el despliegue queda *Staged* en Vercel): revisa Settings › Build and Deployment › *Deployment Checks*. Hasta el 1 de noviembre de 2026 había un check "Deployment" que nunca corría y bloqueaba toda publicación; se quitó. Mientras tanto se puede publicar con *Promote to Production* en el despliegue.

DNS: `mirai.engynex.com` es un CNAME en Hostinger hacia el valor que indica Vercel › Domains. El certificado HTTPS (Let's Encrypt) lo emite y renueva Vercel gratis.

### Separar la base de datos de pruebas (cuando haya cupo en Supabase)

El plan gratis de Supabase permite 2 proyectos activos por dueño. Cuando haya cupo (o con el plan Pro):

1. Crea el proyecto "Mirai Pruebas" en la misma región (`us-west-2`).
2. Copia tu `.env.local` actual (producción) a `.env.produccion.local` y cambia en `.env.local` `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y `SUPABASE_DB_URL` por los del proyecto nuevo. Usa también un `ENCRYPTION_KEY` nuevo (las integraciones se configuran aparte en cada ambiente).
3. `npm run db:migrate` aplica las migraciones a pruebas; `npm run db:migrate:prod` a producción (lee `.env.produccion.local`).
4. En Supabase (proyecto nuevo) › Authentication: *Site URL* = la dirección de pruebas, *Redirect URLs* = esa dirección y `http://localhost:3000/**`; activa Google con el mismo cliente OAuth, TOTP (MFA) y *Manual linking*. En Google Cloud agrega `https://<ref-nuevo>.supabase.co/auth/v1/callback`.
5. En Vercel › Environment Variables, deja las cuatro variables de Supabase y `ENCRYPTION_KEY` solo en **Production** y créalas de nuevo en **Preview** (rama `pruebas`) con los valores del proyecto nuevo. Vuelve a desplegar `pruebas`.
6. Desde ese momento las pruebas automáticas (`npm run test:e2e`) y `npm run dev` usan la base de pruebas.

## Administradores de la plataforma

El panel `/admin` (uso, clientes y opiniones) solo lo ven las cuentas de `public.platform_admins`. Para agregar una (SQL Editor de Supabase):

```sql
insert into public.platform_admins(user_id) select id from auth.users where email = 'tu@correo';
```

## Planes, pagos y anuncios (freemium)

Diseño: `docs/superpowers/specs/2026-11-01-freemium-admin-design.md`. Sin las variables de abajo la app funciona igual: los botones de pago aparecen deshabilitados ("Muy pronto podrás pagar aquí") y los espacios de anuncio invitan a Premium.

| Variable | Tipo en Vercel | Para qué |
|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | **Sensitive** | Mercado Pago › Tus integraciones › Credenciales (de **prueba** en Preview, de **producción** en Production) |
| `MERCADOPAGO_WEBHOOK_SECRET` | **Sensitive** | Mercado Pago › Webhooks › Clave secreta |
| `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` | Config | Wompi › Desarrolladores › Llave pública (`pub_test_…` en pruebas, `pub_prod_…` en producción) |
| `WOMPI_INTEGRITY_SECRET` | **Sensitive** | Wompi › Desarrolladores › Secreto de integridad |
| `WOMPI_EVENTS_SECRET` | **Sensitive** | Wompi › Desarrolladores › Secreto de eventos |
| `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT` | Config | Opcionales: lo normal es configurar AdSense en la consola (Admin › Integraciones globales › Google AdSense); estas variables solo son respaldo |

**URLs de notificación (webhooks):**
- Mercado Pago › Webhooks: `https://mirai.engynex.com/api/pagos/mercadopago` con los eventos *Planes y suscripciones* y *Pagos*.
- Wompi › Desarrolladores › URL de eventos: `https://mirai.engynex.com/api/pagos/wompi`.
- Para el ambiente de pruebas usa la dirección de pruebas y las llaves de prueba (sandbox). Las rutas `/api/pagos/*` son públicas: la autenticidad la da la firma.

**Al publicar los planes en producción:**
1. Aplica las migraciones (ya están en la base compartida) y despliega `main`.
2. Configura las variables y los webhooks de producción de cada pasarela.
3. En `/admin` › Planes, revisa precios y límites y enciende *Hacer cumplir los límites también en la base de datos*.
4. Factura electrónica: conecta tu proveedor (Alegra, Siigo…) o factura a mano con el CSV de `/admin` › Ingresos. El campo `plan_payments.factura_ref` está listo.

**Prueba local de pagos:** con las llaves de prueba en `.env.local`, Mercado Pago y Wompi te dan tarjetas de prueba en su documentación. Los webhooks necesitan una URL pública: usa el ambiente de pruebas de Vercel.
