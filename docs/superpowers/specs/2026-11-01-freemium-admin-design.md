# Mirai freemium: planes, pagos, anuncios y panel de administración

**Estado:** propuesta para aprobación · **Fecha:** 1 nov 2026 · **Decidido por el dueño:** pasarelas, precio, funciones Premium y tipo de anuncios.

## 1. Objetivo

Mirai sale al público. Quien no paga conserva lo básico y ve anuncios; quien paga Premium desbloquea las funciones que más valor (y más costo) tienen, sin anuncios. El dueño administra todo desde `/admin`.

## 2. Decisiones de negocio (tomadas)

| Tema | Decisión |
|---|---|
| Pasarelas | **Mercado Pago** para la suscripción automática con tarjeta · **Wompi** para pagos sueltos (Nequi, PSE, botón Bancolombia, tarjeta) de un mes o un año |
| Precio | **$14.900 COP/mes** o **$149.000 COP/año** (2 meses gratis). Editable desde el panel |
| Solo Premium | IA (consejero, chat, facturas con foto, clasificación automática) · Automatización bancaria (Gmail, importar extractos, Google Calendar) · Impuestos y contador (renta, calendario DIAN, portal del contador) · Familia y varios libros |
| Siempre gratis | Gastos, ingresos, quincena y balance, gastos fijos, tarjetas, suscripciones, presupuesto, préstamos y deudas, metas, retos, logros, inversiones, recordatorios y avisos en la app |
| Límites del plan gratis | 1 libro de cuentas y hasta 2 personas con acceso al hogar |
| Anuncios (solo plan gratis) | **Propios** (creados en el panel) y **Google AdSense** para llenar los espacios sin anuncio propio |

## 3. Decisiones de diseño (propuestas, revisar)

1. **El plan es del hogar, no de la persona.** Quien paga (dueño del hogar) le da Premium a todos los integrantes. Encaja con que los datos son del hogar y con "Familia" como función Premium.
2. **Sin prueba gratis al inicio.** Se puede activar luego desde el panel (por ejemplo 14 días) sin cambiar el modelo de datos.
3. **Gracia de 3 días** después del vencimiento antes de volver al plan gratis (por pagos PSE lentos o reintentos de tarjeta).
4. **Nada se borra al bajar de plan.** Si un hogar vuelve a gratis con 3 libros, los ve en solo lectura y elige cuál sigue activo; la IA y la automatización se pausan.
5. **Premium de cortesía:** el administrador puede regalar Premium (aliados, pruebas, soporte) con fecha de fin.

## 4. Modelo de datos (migración nueva)

- `plans` — `id` (`gratis`, `premium`), nombre, `precio_mes`, `precio_anio`, `funciones jsonb`, `limites jsonb` (`{libros: 1, personas: 2}`), activo. Lectura pública; edición solo admin.
- `subscriptions` — por `household_id`: plan, periodo (`mes`/`anio`), estado (`activa`, `pendiente`, `vencida`, `cancelada`, `cortesia`), proveedor (`mercadopago`, `wompi`, `manual`), `proveedor_ref` (id de la suscripción en Mercado Pago), `vence_at`, `cancelar_al_vencer`, quién la creó.
- `payments` — cada cobro: hogar, suscripción, proveedor, referencia, monto, estado (`aprobado`, `pendiente`, `rechazado`, `reembolsado`), método (tarjeta, PSE, Nequi…), `raw jsonb` del proveedor, fecha de pago. Solo lo escriben los webhooks (clave secreta).
- `ads` — título, texto, imagen, enlace, botón, ubicaciones (`inicio`, `lista`, `reportes`), vigencia, prioridad, activo.
- `ad_events` — impresiones y clics por anuncio y día (agregados, sin datos personales).
- Función `household_plan(household_id)` → `premium` si hay suscripción activa/cortesía con `vence_at + 3 días > now()`, si no `gratis`.
- Triggers que hacen cumplir los límites del plan gratis al **crear** libros e invitar personas (no al leer).
- RLS: el hogar ve su suscripción y sus pagos (dueño); el administrador ve todo; nadie escribe pagos desde el navegador.

## 5. Permisos por plan ("entitlements")

- `lib/plans.ts`: lista única de funciones Premium (`ia`, `banco`, `impuestos`, `familia`) y qué secciones/acciones cubre cada una.
- **Servidor (obligatorio):** las Server Actions y rutas de IA, Gmail, importar extractos, Calendar, renta y portal del contador verifican el plan antes de trabajar. Así no se puede saltar el pago desde el navegador.
- **Interfaz:** `AppContext` incluye `plan`. Componente `<PremiumGate feature="ia">` muestra, en lugar de la función, una tarjeta con lo que se gana y el botón "Pásate a Premium". En el menú, las secciones Premium llevan una etiqueta "Premium" para quien está en gratis.

## 6. Pagos

**Mercado Pago (suscripción con tarjeta, mensual o anual)**
1. "Pásate a Premium" → Server Action crea una suscripción (`preapproval`) con el monto en COP y la frecuencia; redirige al checkout de Mercado Pago.
2. Webhook `/api/pagos/mercadopago` (firma `x-signature` verificada): crea o actualiza `subscriptions` y registra cada cobro en `payments`.
3. Cancelar desde "Mi plan" cancela la suscripción en Mercado Pago; Premium sigue hasta `vence_at`.

**Wompi (pago suelto: 1 mes o 1 año con Nequi, PSE, Bancolombia o tarjeta)**
1. Server Action genera referencia única y la firma de integridad (SHA-256) y abre el Web Checkout de Wompi.
2. Webhook `/api/pagos/wompi` (checksum de eventos verificado): si la transacción queda `APPROVED`, extiende `vence_at` un mes o un año. Sin cobro automático: Mirai avisa 5 días antes de vencer.

**Variables nuevas (Vercel, tipo Secret salvo las públicas):** `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` (Config), `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`. Primero en modo pruebas (sandbox) en el ambiente de pruebas; las llaves de producción solo en Production.

## 7. Pantallas para el usuario

- **`/planes`**: comparación Gratis vs Premium, precio mensual/anual y los dos botones de pago.
- **Ajustes › Mi plan**: plan actual, próximo cobro o vencimiento, método, historial de pagos con comprobante, cancelar y cambiar de periodo.
- **Avisos**: pago aprobado, pago rechazado, Premium por vencer (5 días antes), Premium vencido.

## 8. Anuncios (solo plan gratis)

- `<AdSlot slot="inicio" />` en lugares acordados: tarjeta en el feed de Inicio, entre elementos de listas largas y al final de Reportes. **Nunca** dentro de formularios, al registrar dinero ni en Ajustes. Máximo uno visible por pantalla y siempre con la etiqueta "Publicidad".
- Orden: anuncio propio vigente de esa ubicación → si no hay, AdSense → si no hay consentimiento o no está configurado, invitación a Premium.
- **AdSense** requiere: aprobación de Google para el dominio `mirai.engynex.com`, el archivo `ads.txt` y un **aviso de cookies** con consentimiento (Ley 1581): sin aceptar, no se carga AdSense. Variable `NEXT_PUBLIC_ADSENSE_CLIENT`.
- Política de privacidad y términos se actualizan (anuncios, pagos, cookies).

## 9. Panel de administración (`/admin`)

Ya existen **Resumen** (uso), **Clientes** y **Opiniones**. Se agregan:
- **Ingresos**: ingreso mensual recurrente (MRR), suscriptores activos por plan y pasarela, nuevos y cancelados del mes, pagos recientes y rechazados, exportar CSV.
- **Clientes**: columna de plan real, vencimiento, total pagado y botón "Regalar Premium hasta…".
- **Planes**: editar precios, límites y textos (los cambios aplican a cobros nuevos).
- **Anuncios**: crear/editar anuncios propios con vista previa, ubicaciones y fechas; impresiones, clics y CTR; estado de AdSense.

## 10. Requisitos legales en Colombia (fuera del código, a cargo del dueño)

- **Factura electrónica DIAN** por cada venta de Premium: lo más simple es un proveedor (Alegra, Siigo) conectado después a `payments`. Se deja el campo `factura_ref`.
- **Ley 1480 (Estatuto del Consumidor):** derecho de retracto de 5 días hábiles en ventas en línea y cancelación fácil (ya contemplada en "Mi plan").
- **Ley 1581:** consentimiento de cookies para AdSense y actualizar la política de datos.
- Cuentas de comercio en Mercado Pago y Wompi a nombre de Engynex (las crea el dueño).

## 11. Fases (cada una se puede publicar sola)

| Fase | Contenido | Depende de |
|---|---|---|
| **A** | Planes, `household_plan`, permisos en servidor, `<PremiumGate>`, límites del plan gratis, Premium de cortesía, `/planes` y "Mi plan" (sin pasarela) | — |
| **B** | Mercado Pago (suscripción, webhook, cancelar) en sandbox → producción | Cuenta de Mercado Pago |
| **C** | Wompi (pago suelto, webhook, aviso de vencimiento) en sandbox → producción | Cuenta de Wompi |
| **D** | Anuncios propios + pestaña Anuncios del panel | — |
| **E** | AdSense + aviso de cookies + `ads.txt` | Aprobación de Google |
| **F** | Pestaña Ingresos y Planes del panel | B o C |

## 12. Pruebas

- Vitest: `household_plan` (vigencia y gracia), cálculo de MRR, verificación de firmas de Mercado Pago y Wompi con ejemplos de su documentación, elección del anuncio por ubicación.
- E2E: usuario gratis ve el paywall en Consejero y no puede crear un segundo libro; con Premium de cortesía lo desbloquea; anuncio propio aparece en Inicio solo en gratis; el administrador crea un anuncio y regala Premium.
- Pagos: flujo completo en sandbox de cada pasarela con sus tarjetas de prueba, webhooks probados en el ambiente de pruebas.
