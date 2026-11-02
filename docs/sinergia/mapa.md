# Mapa de sinergia de Mirai: qué conecta con qué

> Auditoría de arquitectura funcional, hecha el 2026-11-02 sobre la rama `pruebas`, con los cambios sin confirmar que había en ese momento. Solo se leyó el código: no se editó la app ni se corrieron build ni E2E.
> La base se revisó con consultas de solo lectura a los catálogos: publicación `supabase_realtime`, triggers, funciones, restricciones y `cron.job`. No se leyeron datos de usuarios.
> Convención: **✔ conectado** · **◐ parcial** · **✘ falta** · **¿? no verificado**. La evidencia va como `archivo:línea`. Las líneas pueden moverse unas pocas posiciones porque hay archivos modificados en el árbol de trabajo (por ejemplo `lib/domain/flujo-integral.ts`).

---

## 0. Resumen

Mirai ya tiene un núcleo bien enlazado en varios puntos:
- **Pagar un gasto fijo** (`pay_fixed_expense`) crea el gasto y el pago, y abona a la meta o al fondo, todo en una sola transacción. "Deshacer" revierte todo por trigger.
- El **flujo integral** (`lib/domain/flujo-integral.ts`) cuenta cada peso una sola vez entre gastos, fijos, tarjetas, préstamos, suscripciones, mesadas, fondo e impuestos.
- Las **notificaciones** salen de una sola fuente (`agenda()` → `notifs()`).
- La **IA** se bloquea por plan en un solo punto (`lib/ai/run.ts:91`).

Los huecos grandes son estos:

1. **No existe el concepto "cuenta con saldo"**:
   - `payment_methods` es solo una etiqueta: columnas `id, nombre, icon, sort` (`supabase/migrations/20261031000100_core.sql:217`).
   - `assets` es un valor que se escribe a mano (`core.sql:412`).
   - Ningún gasto, ingreso, cuota, pago de tarjeta o aporte mueve el saldo de una cuenta.
   - Por eso el Balance ("Dinero en cuentas") y la liquidez que usan el Dashboard, el consejero y el chat se quedan quietos mientras el flujo sí se mueve.
2. **Hay registros enlazados que se desincronizan**, porque los triggers solo cubren fijos y fondo:
   - compra con tarjeta ↔ gasto
   - gasto compartido ↔ gasto
   - "Ya se cobró" de una suscripción ↔ gasto
   - editar el valor de un gasto que salió de pagar un fijo
   - abono directo a una meta, que no deja movimiento
3. **Coexisten cuatro motores de cálculo** que pueden dar cifras distintas en pantallas distintas:
   - `flujoIntegral` (Balance y Dashboard)
   - `flujo()` clásico (Flujo de caja)
   - `quincena()` + `totales()` (Inicio)
   - `finCtx()` (chat y consejero)
4. **Los avisos no se programan cada hora**:
   - `cron.job` está vacío en la base, así que `mirai_schedule_notify` nunca se activó.
   - Solo corre el cron diario de Vercel a las 6 a. m. (`vercel.json`). La hora que elige el usuario no se respeta.
   - Faltan avisos de corte de tarjeta, fechas DIAN por cédula, primas, mesadas, compartidos y logros.
5. **Premium se exige casi siempre solo en la interfaz**: impuestos, familia e importar. El servidor y la RLS no revisan el plan, y `requirePremium` (`lib/dal.ts:97`) no se usa en ninguna parte.
6. **La IA del chat solo puede crear 4 tipos de registro** (gasto, ingreso extra, meta y recordatorio). No categoriza con IA, y su contexto deja por fuera tarjetas, pasivos, ingresos extra y topes.

---

## 1. Inventario de módulos

Abreviaturas: **L** = lee · **E** = escribe · **D** = cálculos de `lib/domain` que usa.
"Libro" = `loadBookData` (`lib/book-data.ts:15-32`), que carga 16 partes: `book_settings, categories, incomes, extra_incomes, expenses, fixed_expenses(+payments), subscriptions, loans(+payments), credit_cards(+card_purchases), assets, liabilities, investments, goals, calendar_events, contacts, entities`.
El libro **no** incluye: `emergency_funds, fund_movements, allowances*, shared_*, wishlist, providers, net_worth_snapshots, tax_*, payment_methods`.

### 1.1 Secciones del menú (`lib/nav.ts`, `app/(app)/*`)

| Sección (ruta) | Lee | Escribe | Cálculos de `lib/domain` | Notas |
|---|---|---|---|---|
| Puesta en marcha `/puesta` | libro, profiles | — | `features/setup/use-setup.ts` | Avance por pasos (ingresos, fijos, deudas, gasto, meta) |
| Inicio `/inicio` | libro | `expenses` (entrada rápida, `features/home/quick-entry.tsx:50`) | `quincena`, `totales`, `agenda`, `notifs`, `hormigas` (`features/home/home-view.tsx:22`), `insights` (hallazgos) | Motor **distinto** del Dashboard |
| Dashboard `/dashboard` | libro, `net_worth_snapshots`, `tax_assets`, `allowances`, `allowance_movements`, `fund_movements` (`features/balance/use-integral.ts:26-31`) | — | `flujoIntegral`, `estadoIntegral`, `compromisos`, `capacidad`, `deudas`, `metasAvance`, `serieMeses`, `decisiones` (`features/dashboard/dashboard-view.tsx:20-21`) | Nuevo (sin confirmar) |
| Balance `/balance` | igual que Dashboard | `assets`, `liabilities` (`features/balance/asset-form.tsx`), `net_worth_snapshots` (`features/patrimonio/patrimonio-card.tsx:31`) | `flujoIntegral`, `estadoIntegral`, `lib/domain/balance.ts` | La foto de patrimonio solo se guarda al **abrir** Balance |
| Ingresos `/ingresos` | `incomes`, `income_categories`, `book_settings.nomina` | `incomes` (con `reparto` y `deducciones`) | `reparto.ts`, `payroll.ts` (`planIngreso`, `dedCalc`) | Son plantillas recurrentes: no hay registro de "recibido" |
| Gastos `/gastos` (+ fijos, suscripciones, tarjetas) | `expenses`, `categories`, `payment_methods`, `providers`, `keyword_rules` | `expenses` | `hormiga.ts`, `balance.ts` | Categoría con IA a los 750 ms (`features/expenses/expense-form.tsx:126-150`) |
| Fijos `/fijos` | `fixed_expenses`, `fixed_expense_payments` | RPC `pay_fixed_expense` / `unpay_fixed_expense` | `fixed.ts`, `reparto.ts` (`fijoValor`) | Bien enlazado (ver §2.3) |
| Suscripciones `/suscripciones` | `subscriptions`, `expenses` | `subscriptions`; `expenses` con "Ya se cobró" (`features/subscriptions/subscriptions-view.tsx:50-60`) | `subscriptions.ts` (`detectSubs`, `subOcc`) | Dos escrituras sin transacción |
| Tarjetas `/tarjetas` | `credit_cards`, `card_purchases` | `card_purchases` + `expenses` con `origen="tarjeta"` (`features/cards/card-forms.tsx:107-115`); `pagada=true` (`features/cards/cards-view.tsx:66`) | `cards.ts` (`compraEstado`, `tarjetaPagoMes`, `tarjetasDeuda`) | No se registra el pago de la tarjeta |
| Proveedores `/proveedores` | `providers`, `fixed_expenses`, `subscriptions`, `loans`, `expenses` | `providers` | `proveedores.ts`, `proveedor-pagos.ts` | Triggers `expense_provider_default`, `fixed_provider_sync`, `provider_rename_sync`/`_loans` |
| Correo del banco `/correo` | Gmail (`snippet`), `expenses.external_id` | `expenses` con `origen="correo"` (`features/correo/correo-view.tsx:80`) | `router.mailMayBePurchase`, `localCat` | Premium "banco". No enlaza medio de pago ni tarjeta |
| Importar `/importar` | archivo CSV/XLSX, historial de `expenses` | `expenses` con `origen="importar"` (`features/import/import-view.tsx:125-128`); respaldo v4, que escribe 30+ tablas (`features/import/v4.ts`) | `csv.ts` | Sin `external_id`. Los abonos se guardan como gastos |
| Me deben / Le debo `/me-deben`, `/le-debo` | `loans`, `loan_payments`, `contacts`, `entities`, `providers` | `loans`, `loan_payments` (`features/loans/pay-loan-dialog.tsx:80`) | `loans.ts` (`loanEngine`), `loan-tipos.ts`, `cobros.ts` | El pago no crea gasto ni mueve una cuenta. Ver flujo §2.5 |
| Contactos `/contactos` | `contacts`, `loans` | `contacts` | — | Enlaza con préstamos (`contact_id`) |
| Salir de deudas `/estrategia` | `loans` | — | `debt-strategy.ts` (`features/strategy/strategy-view.tsx:52-53`) | **Solo préstamos**: deja por fuera tarjetas y pasivos |
| Presupuesto `/presupuesto` | `categories.tope`, `expenses`, `incomes` | `categories.tope` | `ingresoMensual` (`features/planning/budget-view.tsx:24`) | 50/30/20 sobre el ingreso mensual, sin quincenas |
| Flujo de caja `/flujo` | libro | — | `flujo()` clásico (`lib/domain/cashflow.ts:33-65`) | Motor **distinto** de `flujoIntegral` |
| Metas y emergencia `/metas` | `goals`, `emergency_funds`, `fund_movements`, `fixed_expenses` (aportes) | `goals.ahorrado` directo (`features/goals/goals-view.tsx:102`); RPC `fund_save`/`fund_use`; `fixed_expenses` con `link_type` (`features/goals/goal-dialogs.tsx:153-154`) | `savings.ts` (`metaPlan`, `metaFondo`) | El abono directo a una meta no deja movimiento |
| Retos `/retos` | `savings_challenges`, `expenses` | `savings_challenges` | `challenges.ts` | No lleva lo ahorrado a una meta |
| Logros `/logros` | libro, `gami_*` | `gami_badges`, `gami_missions`, `gami_state`, `gami_visits` (`features/gami/gami-check.tsx:35,51-53`) | `gami.ts` | Solo en el cliente; no deja aviso |
| Primas `/primas` | `incomes` | — | `primas.ts`; IA `primaPlan` | Sin aviso ni evento de calendario automático |
| Por miembro `/familia` | `expenses` (`member_id`/`member_ids`), `incomes` | — | `pagosMes` (`features/planning/family-view.tsx:55-61`) | Premium "familia" (solo en la interfaz) |
| Mesadas `/mesadas` | `allowances`, `allowance_movements` | ídem (`features/extras/mesadas-view.tsx:48-65`) | — | Entra al flujo integral por `X.mesadas` |
| Compartidos `/compartidos` | `shared_groups`, `shared_group_expenses` | ídem + `expenses` con `origen="compartido"` (`features/extras/compartidos-view.tsx:110-115`) | `shared.ts` | Borrar el gasto del grupo no borra el gasto ligado |
| Lista de deseos `/deseos` | `wishlist` | `wishlist` | — | No enlaza con metas ni con el consejero |
| Calculadoras `/calculadoras` | `ref_uvt` | — | `calculadoras.ts` | Única lectora de `ref_uvt` |
| Inversiones `/inversiones` | `investments`, `entities` | `investments` | `investments.ts` (`inv`) | No hay precios automáticos de cripto ni acciones |
| Renta `/renta` | libro + `tax_years`, `tax_assets`, `attachments`, `family_members` (`features/renta/data.ts:28-36`) | `tax_years`, `tax_assets` desde el navegador (`features/renta/renta-owner.tsx:29-45`) | `renta.ts` | Ver §2.9 |
| Calendario fiscal `/calendario` | `calendar_events`, `ref_renta_calendar`, `ref_renta_regimenes`, `tax_assets` | `calendar_events` | `features/agenda/fiscal.ts` (`calEst`, `nextOcc`) | Avisa solo si el evento se agregó a mano |
| Contador `/contador` + `app/contador/[token]` | `loadRentaData` con el cliente admin (`features/contador/actions.ts:106`) | `accountant_shares`, `accountant_notes` | `renta.ts` | Entrega el libro completo al portal |
| Próximos pagos `/recordatorios` | libro | Google Calendar (botón) | `agenda()` | No existe una tabla de recordatorios propia |
| Salud financiera `/indicadores` | libro | — | `indicadores`, `healthScore` (`lib/domain/indicators.ts:29,79`) | |
| Reportes `/reportes` | libro | `monthly_summaries` | `indicadores`, `report.ts`, IA `resumen_mes` (`features/reports/actions.ts:22-52`) | |
| Automatizaciones `/automatizaciones` | `automations`, `automation_runs` | ídem | `lib/automations/*` | Ver §2.12 |
| Consejero IA `/consejero` | libro + `book_settings` | `advisor_consultations` | `advisor.ts` (`asAnalyze`, `finCtx`) | Funciona en Gratis a propósito, pero el menú lo marca Premium (`lib/plans.ts:29`) |
| Perfil, Referidos, Ajustes | `profiles`, `referral_codes`, `book_settings`, `notification_rules`, `integrations_public` | ídem | — | Alertas en `features/settings/tabs/alerts.tsx` |
| Centro de ayuda (novedades, FAQ, manual, academia, opiniones) | `lib/content/*`, `feedback` | `feedback`, `user_preferences.extra.academia` | — | |

### 1.2 Servicios transversales

| Servicio | Archivos | Lee | Escribe |
|---|---|---|---|
| Cron de avisos | `app/api/cron/notify/route.ts` (Vercel `0 11 * * *` con `?daily=1`; pg_cron **sin programar**) | `books`, `household_members`, `notification_rules`, `profiles`, libro | `notifications`, `notification_rules.last_sent`, `notification_log`, `ref_*`, `book_settings.trm/usura` |
| Notificaciones | `lib/notify/{digest,rules,channels,email,whatsapp,wa-templates,log}.ts` | `agenda()`/`notifs()` | `notifications` (campana), correo (Resend, Brevo…), Telegram, push y WhatsApp como un **solo resumen** |
| Automatizaciones | `lib/automations/*`, `features/automations/runner.tsx` | `automation_events`, que se encola por trigger **solo** en INSERT de `expenses`, `extra_incomes` y `fixed_expense_payments` (`supabase/migrations/20261103000300_automatizaciones.sql:133-169`) | `expenses`, `goals`, `emergency_funds`, `fund_movements`, `calendar_events`, `notifications` |
| IA | `lib/ai/run.ts` (plan → interruptor → caché → cupo → límite → proveedores → `ai_usage`) | `ai_cache`, `integrations`, `platform_integrations` | `ai_usage`, `ai_cache` |
| Chat | `app/api/chat/route.ts`, `lib/chat/tools.ts`, `features/chat/actions.ts` | libro + `emergency_funds` | `chat_*`; con confirmación: `expenses`, `extra_incomes`, `goals`, `calendar_events` |
| Integraciones | `lib/integrations/registry.ts`, `resolve.ts`, `features/integrations/store.ts:18-48` | `integrations`, `platform_integrations` | — |
| Google | `lib/google.ts`, `app/api/google/*`, `features/correo/actions.ts:25-91` | `google_connections` | Gmail solo lectura. Calendar solo crea eventos (POST) |
| Datos de referencia | `features/integrations/{data-sources,refresh}.ts` | TRM, usura, festivos y FX de APIs públicas | `ref_trm`, `ref_usury_rate`, `ref_holidays`, `book_settings.trm/usura` |
| Pagos del plan | `app/api/pagos/{mercadopago,wompi}`, `lib/payments/{apply,signatures,reminders,mercadopago}.ts` | — | `plan_payments`, `plan_subscriptions`, `coupons.usos`, `notifications` |
| Consola admin | `app/(admin)/admin/*`, `features/admin/server.ts` | agregados (sin montos) | `platform_*`, `plans`, `broadcasts`, `admin_audit` |
| Realtime | `hooks/use-realtime.ts:10-18` (`LIVE_TABLES`) e invalidación en `hooks/use-book-data.ts:16-58` | publicación `supabase_realtime` | caché de TanStack |

---

## 2. Flujos de punta a punta

### 2.1 Gasto

| Destino | Estado | Evidencia y detalle |
|---|---|---|
| → cuenta o activo (baja el saldo) | ✘ | `payment_methods` no tiene relación con `assets` (`core.sql:217`, `core.sql:412`). El gasto guarda `payment_method_id` (`expense-form.tsx:179`), pero nada lo convierte en saldo. "Dinero en cuentas" sale de `assets.valor`, que es manual (`lib/domain/flujo-integral.ts:531-534`; `totals.ts:37-42`) |
| → presupuesto | ✔ | `notifs` compara con `categories.tope` (`lib/domain/agenda.ts:123-131`). El "Por gastar" del flujo integral resta lo gastado (`flujo-integral.ts`, regla 7) |
| → categoría con IA | ◐ | ✔ formulario (`expense-form.tsx:126-150`), correo (`correo-view.tsx:72`), importar (`import-view.tsx:105`), tarjeta, fijo y suscripción (`useAICategory`). ✘ entrada rápida, que solo usa `localCat` (`quick-entry.tsx:33-50`); chat (`lib/chat/tools.ts:31-37`); automatización "movimiento" (`lib/automations/server.ts:76-78`); compartidos, que usan "Otros" (`compartidos-view.tsx:112`); "Ya se cobró" (`subscriptions-view.tsx:54`) |
| → hormiga | ✔/◐ | `hormigas()` (`totals.ts:146-168`) y aviso mensual `h:YYYY-MM` (`agenda.ts:119-122`). La automatización `hormiga` viene inactiva (`lib/automations/templates.ts:66`). Etiquetas de origen mal puestas: el correo guarda `hormiga_src:"ia"` aunque la decisión sea local (`correo-view.tsx:80`) e importar guarda siempre `"manual"` (`import-view.tsx:127`) |
| → logros | ✔ | `gami.ts:60-62,81-84` cuenta gastos. Solo en el cliente (`gami-check.tsx`) |
| → notificaciones | ◐ | Presupuesto y hormiga ✔ (`agenda.ts:119-131`), pero con un solo aviso por categoría y mes (`b:${c.id}:${k}`) y sin umbrales escalonados (80 % y 100 %) |
| → reportes y renta (deducibles) | ✘ | No existe una marca "deducible" en `expenses`. La renta usa los valores escritos a mano en `tax_years.ded` (`lib/domain/renta.ts:159,174-175`). Los topes de consumo sí suman gastos y compras con tarjeta del año (`renta.ts:207-208`) |
| → Balance, Dashboard y flujo | ✔ | `flujoIntegral` evita contar dos veces fijos, tarjeta, préstamo y suscripción (`flujo-integral.ts:1-20`, `balance.ts:18`) |
| → automatizaciones | ✔ | Trigger `trg_automation_enqueue` en INSERT (`automatizaciones.sql:165`). ✘ en UPDATE |
| → por miembro | ✔ | `member_id` / `member_ids` (`family-view.tsx:55-61`) |
| → proveedor | ✔ | Trigger `expense_provider_default` (BEFORE INSERT) |

### 2.2 Ingreso

| Destino | Estado | Evidencia y detalle |
|---|---|---|
| → cuenta o activo | ✘ | `incomes` son plantillas (`valor`, `frec`, `reparto`) sin registro de "recibido" ni cuenta destino. `extra_incomes` no tiene `payment_method_id` (columnas en §1.1) |
| → presupuesto y reparto por quincena | ◐ | Balance, Dashboard y flujo integral usan `incomePagos` ✔. El presupuesto 50/30/20 usa `ingresoMensual` sin quincenas (`budget-view.tsx:24`). `finCtx` (chat y consejero) solo suma `incomes`, sin `extra_incomes` (`lib/domain/advisor.ts:239`) |
| → metas (aporte automático) | ◐ | El aporte programado es un `fixed_expense` con `link_type` (`goal-dialogs.tsx:149-154`) que se paga **a mano**. Existe el disparador "ingreso de nómina" (`lib/automations/detect.ts:89-132`) con la acción "apartar", pero no viene como plantilla activa |
| → renta (ingresos laborales) | ◐ | `rentaAuto` anualiza las plantillas actuales (`renta.ts:130-150`), no los pagos del año que se declara. Ignora `extra_incomes`. **Recalcula** aportes y retención (`renta.ts:143-146`) en lugar de leer `incomes.deducciones` (`income-form.tsx:182`) |
| → nómina y retención | ✔ | `dedCalc`, `book_settings.nomina`, FSP (`payroll.ts`) |
| → Balance y Dashboard | ✔ | `flujo-integral.ts:255` (extras) y los ingresos por `incomePagos` |
| → automatizaciones | ◐ | Solo los INSERT de `extra_incomes` (`automatizaciones.sql:167`). Las plantillas `incomes` no encolan nada |

### 2.3 Gasto fijo o suscripción → pago → gasto → cuenta → avisos → agenda

| Paso | Estado | Evidencia |
|---|---|---|
| Fijo → pago → gasto (sin duplicar) | ✔ | RPC `pay_fixed_expense` (`supabase/migrations/20261031000700_fixed_pay.sql:7-50`): inserta `expenses` con `fixed_expense_id` y `fixed_expense_payments` con `expense_id` en una transacción. `gastoYaContado` (`balance.ts:18`) evita contarlo dos veces |
| Borrar o restaurar el gasto del fijo | ✔ | `expense_fixed_sync` (`fixed_pay.sql:66-91`) revierte el pago, la meta y el fondo |
| **Editar el valor** del gasto del fijo | ✘ | `expense_fixed_sync` solo reacciona a `deleted_at`. `fixed_expense_payments.valor` queda con el valor viejo, así que Gastos y Flujo (que usa el valor del pago, regla 1) muestran cifras distintas |
| Duplicado manual (el arriendo pagado también se anotó como gasto o llegó por el correo del banco) | ✘ | Nada empareja un gasto suelto con un periodo pendiente del fijo |
| Suscripción → "Ya se cobró" → gasto | ◐ | `subscriptions-view.tsx:50-60`: hace dos escrituras sin transacción, el gasto queda sin enlace (no hay `subscription_id`; el emparejamiento es por nombre o proveedor, regla 4 de `flujo-integral.ts`) y el `origen` queda en el valor por defecto. Borrar el gasto **no** devuelve `proximo` |
| → cuenta | ✘ | Igual que §2.1 |
| → avisos (correo, WhatsApp, Telegram, push y campana) | ✔ | `agenda.ts:41-46` (fijos) y `:64-65` (suscripciones activas: `lib/book-data.ts:72`). Salen como un solo resumen diario (`lib/notify/digest.ts:81-92`) |
| → Google Calendar | ◐ | Solo con un botón manual (`features/agenda/payments-calendar.tsx:231-243` → `features/correo/actions.ts:71-91`). Siempre crea eventos, nunca actualiza ni borra, y exige el plan "banco" (`correo/actions.ts:73`) |
| → agenda | ✔ | `/recordatorios` usa `agenda()` |

### 2.4 Tarjeta de crédito

| Paso | Estado | Evidencia |
|---|---|---|
| Compra → gasto `origen=tarjeta` | ◐ | `card-forms.tsx:107-115`: dos escrituras sin transacción. Si falla la segunda, queda un gasto huérfano |
| Compra → cupo y deuda | ✔ | `compraEstado`, `tarjetasDeuda` (`lib/domain/cards.ts:34,58`); Balance (`flujo-integral.ts`, sección de tarjetas en `estadoIntegral`) |
| **Borrar o editar** el gasto `origen=tarjeta` en Gastos | ✘ | No hay trigger: la compra (`card_purchases.expense_id`, ON DELETE SET NULL) sigue sumando deuda. En la tarjeta tampoco se puede editar ni borrar una compra suelta: solo existe borrar la tarjeta completa (`cards-view.tsx:71-78`) |
| Borrar la tarjeta | ◐ | Borra las compras (`cards-view.tsx:73`), pero **no** los gastos ligados: quedan como gasto suelto |
| Corte y pago | ◐ | `tarjetaPagoMes` estima la cuota del mes (`cards.ts:49`). "Pagar total" solo marca `pagada=true` (`cards-view.tsx:66`), sin fecha, valor, medio ni registro del pago. El flujo usa la estimación, no el pago real |
| → cuenta | ✘ | No existe el pago de la tarjeta como movimiento |
| → avisos | ◐ | Pago mínimo ✔ (`agenda.ts:60-63`, solo si `tarjetaPagoMes>0`). **Fecha de corte ✘** |
| Correo del banco o importar con tarjeta | ✘ | Crean `expenses` sueltos, sin `card_purchases` ni `payment_method_id` (`correo-view.tsx:80`, `import-view.tsx:125-128`). Una compra con tarjeta queda como salida de caja inmediata y la deuda de la tarjeta no sube |
| → estrategia de deudas | ✘ | `strategy-view.tsx:52-53` solo usa `loans`. El Dashboard sí incluye las tarjetas en `deudas()` (`lib/domain/dashboard.ts:154-190`) |
| → renta (patrimonio líquido) | ✘ | `patrimonio()` no resta la deuda de tarjetas (`renta.ts:199`) |

### 2.5 Préstamos: Le debo y Me deben

| Paso | Estado | Evidencia |
|---|---|---|
| Préstamo → cuotas (plan) | ✔ | `loanEngine` (`lib/domain/loans.ts`), con tipos en `loan-tipos.ts:32-47` y `loans.primera` |
| Cuota o abono → `loan_payments` | ✔ | `pay-loan-dialog.tsx:76-82` (sin medio de pago) |
| → gasto | — (a propósito) | El flujo integral usa la cuota del plan (regla 3). `loan_payments.expense_id` existe pero v5 no lo usa |
| → cuenta o activo | ✘ | Ni el desembolso ni el préstamo que hiciste ni la cuota mueven una cuenta |
| → avisos de cuota (Le debo) | ✔ | `agenda.ts:47-55` (hasta 3 vencidas) |
| → recordatorio de cobro (Me deben) | ◐ | Aviso de la próxima cuota ✔ (`agenda.ts:56-59`), sin el total de las vencidas. El cobro al deudor es **manual** por `wa.me`/`mailto` (`features/loans/reminder-dialog.tsx:52-53,74-75`), sin programación ni registro. `lib/domain/cobros.ts` solo guarda tus llaves y cuentas para recibir |
| Empeños | ✔ | `agenda.ts:148-165` (ignora el interruptor `nf.pagos`) |
| → estrategia de deudas | ◐ | Solo `loans`. Faltan tarjetas y `liabilities` |
| → Balance y Dashboard | ✔ | `estadoIntegral` (`flujo-integral.ts:539-548`), `deudas()` |
| → contactos, entidades y proveedores | ✔ | `contact_id`, `entity_id`, `provider_id`; triggers `loan_acreedor_sync`, `loan_provider_check`, `provider_rename_loans` |
| → automatizaciones | ✘ | `loan_payments` no encola eventos. El disparador "pago_proximo" sí cubre cuotas, pero no cobros (`detect.ts:89-132`) |
| → chat | ◐ | Lee las deudas (`lib/chat/tools.ts:81`) pero no puede crear préstamos ni pagos |

### 2.6 Metas, ahorro, fondo de emergencia, inversiones y patrimonio

| Paso | Estado | Evidencia |
|---|---|---|
| Aporte programado (fijo con `link_type`) → meta o fondo | ✔ | `pay_fixed_expense` actualiza `goals.ahorrado` o `emergency_funds.saldo` + `fund_movements` (`fixed_pay.sql`) |
| Fondo: guardar y usar | ✔ | RPC `fund_save`, `use_emergency_fund`/`fund_use`; trigger `expense_fund_sync` (`20261031000500_fund.sql:23-37`) |
| **Abono directo a una meta** | ✘ | `goals-view.tsx:102`: `update({ ahorrado: ahorrado + v })`. Lee y luego escribe (puede perderse un abono si dos personas abonan a la vez), sin movimiento ni fecha. Por eso no aparece en "Ahorras" del Balance y el Dashboard, que solo leen fijos con `link_type` y `fund_movements` (`flujo-integral.ts:400-404`). "Deshacer" no existe |
| Metas y fondo → patrimonio | ✘ | `totales()`/`estadoIntegral()` no incluyen `goals.ahorrado` ni `emergency_funds.saldo` (`totals.ts:118-127`, `flujo-integral.ts:526-575`). Si esa plata no está registrada también como activo, el patrimonio sale más bajo |
| **Fondo de emergencia: Metas vs. Dashboard** | ✘ (cifras distintas) | Metas usa `ef.activo ? ef.saldo : liquidez` (`goals-view.tsx:91-94`). El Dashboard usa **siempre** `liquidez` (`dashboard.ts:108-118`: `faltaFondo = metaMeses*basicos − liq`). Con el fondo activo, las dos pantallas dicen cosas distintas |
| Inversiones → patrimonio y liquidez | ✔ | `inv()` en `totales` y `liquidez` (solo `tipo==="ahorro"`) |
| Inversiones → avisos de vencimiento | ◐ | `agenda.ts:132-140`, con dedupe `i:${id}` sin fecha: si renuevas el CDT, no vuelve a avisar |
| Patrimonio mes a mes | ◐ | `net_worth_snapshots` solo se guarda al abrir Balance desde el navegador (`patrimonio-card.tsx:31`). Si nadie abre Balance ese mes, ese mes queda sin dato. No lo guarda el cron |
| Metas → avisos | ◐ | Fecha a 30 días ✔ (`agenda.ts:141-146`). "Meta cumplida" solo como automatización |
| Retos y deseos → metas | ✘ | `retos-view.tsx` y `deseos-view.tsx` no escriben en `goals` |

### 2.7 Planes (freemium)

| Función | Interfaz | Servidor o base | Estado |
|---|---|---|---|
| ia | Avisos en consejero, composer y automatizaciones | `lib/ai/run.ts:91` (todo pasa por `run()`, incluido `aiStream`) | ✔. Excepción: `features/integrations/actions.ts:76` (`generateText` en "probar conexión": sin plan, sin créditos, sin `ai_usage`, y puede usar la clave de la plataforma) |
| banco: correo | `<PremiumGate>` (`app/(app)/correo/page.tsx:9`) | `scanMail` (`correo/actions.ts:27`), `api/google/connect/route.ts:17` | ✔ |
| banco: importar | `<PremiumGate>` (`importar/page.tsx:9`) | ✘: inserta desde el navegador con RLS (`import-view.tsx:125`) | ◐. Además, el respaldo v4 queda detrás de "banco", así que un usuario Gratis no puede restaurarlo |
| impuestos: renta y calendario | `<PremiumGate>` | ✘: `tax_years`/`tax_assets` desde el navegador (`renta-owner.tsx:29-45`) | ◐ |
| impuestos: contador | `<PremiumGate>` | Solo `createShare` (`contador/actions.ts:46`). `rotateShare` (`:59`), `ownerNote` (`:73`), `contadorOpen` (`:99`), `contadorNotes` y `contadorFileUrl` no revisan | ◐: si el hogar baja a Gratis, el portal sigue abierto |
| impuestos: avisos del calendario | — | `agenda.ts:66-71` avisa sin revisar el plan | ◐ |
| familia: por miembro, mesadas y compartidos | `<PremiumGate>` | ✘ RLS | ◐ |
| automatizaciones | `activeLimit`: cualquier plan distinto de `gratis` = sin límite (`lib/automations/limits.ts:9-13`) | Trigger `automation_limit`: solo `household_plan='premium'` es ilimitado (`automatizaciones.sql:118`) | ✘ no coinciden. Las tres plantillas activas por defecto (`templates.ts:26,42,50`) ocupan el cupo de Gratis |
| libros y personas | `new-book-dialog.tsx:35-41`, `household/actions.ts:104,212` | Trigger `enforce_free_limits` **apagado** (`platform_settings.limites_db=false`) | ◐ |
| créditos de IA | — | `run.ts:110-116` (se revisan antes y se cobran después: varias llamadas a la vez pueden pasarse) | ◐. Gratis tiene 100 créditos que no puede usar (`ia_uso.sql:56`) |
| notificaciones | — | Ningún tipo de aviso revisa el plan. WhatsApp y Telegram dependen de `platform_integrations.planes` (`integrations/store.ts:36-47`). Push no revisa la integración (`digest.ts:141-144`) | ◐ |
| `requirePremium` / `householdCan` | — | Definidas (`lib/dal.ts:97`, `lib/plan-server.ts:13`), **sin usos** | ✘ |

### 2.8 Hogar, familia y roles

- **Matriz de roles** (owner > admin > editor > registra > viewer): `lib/household/roles.ts:7,52-55`. En el servidor: `requireRole`/`requireCan` (`lib/dal.ts:112-119`). En la interfaz: `useCanEdit`/`useCanRecord`/`useCanEditRow` (`components/app/app-context.tsx:22-33`). ✔ en las vistas principales.
- ✘ **Entrada rápida** sin revisión de rol: se muestra a todos (`home-view.tsx:189`) y solo la RLS la frena.
- ✘ **Chat con el rol antiguo**: `household.role !== "viewer"` (`app/api/chat/route.ts:66`). "registra" no puede registrar por chat aunque sí puede en los formularios.
- ◐ **IA abierta al viewer**, que gasta créditos: `classifyExpenses`, `improveCobro`, `primaPlan` (`features/ai/actions.ts:55,189,200`), `chatTitle`, chat.
- ◐ **Preferencias de aviso por libro, no por persona**: `book_settings.notif` (`features/settings/prefs.ts:42`). Si un miembro apaga un tipo de aviso, se apaga para todo el hogar.
- ◐ `family_members` y `household_members` están en la publicación, pero **no** en `LIVE_TABLES`: si se agrega un miembro, los demás no lo ven hasta recargar.
- Gastos por miembro ✔. Mesadas entran al flujo ✔. Compartidos ◐ (§3, P0-4).

### 2.9 Impuestos: renta, predial, vehicular y calendario fiscal

| Enlace | Estado | Evidencia |
|---|---|---|
| Calendario → avisos | ◐ | Solo los `calendar_events` que el usuario agregó (`fiscal-calendar.tsx:76-79`). ✘ fecha DIAN automática según los dígitos de la cédula (`profiles.digitos` existe). `agenda()` **ignora `anual`** (`agenda.ts:66-71`): un recordatorio de una sola vez (incluidos los que crea la acción `agenda` con `anual:false`, `lib/automations/server.ts:100`) se vuelve a avisar cada año. Los eventos `tipo="ingreso"` (prima, cesantías) salen como "Pago… ten listos $X" (`agenda.ts:115-117`) |
| Calendario → flujo integral | ✔ | Estima predial, vehicular y renta (`use-integral.ts:37-55`), sin estimar dos veces con un fijo (regla 6) |
| Calendario → Flujo de caja clásico | ◐ | `cashflow.ts:50,55` compara solo el mes (todo anual, ignora `anual`) |
| Renta ← ingresos y retenciones | ◐ | Ver §2.2. No usa `extra_incomes` ni `incomes.deducciones` |
| Renta ← bienes | ◐ | Tabla propia `tax_assets`, **copiada** de `assets` (`renta-owner.tsx:41-46`) y sin sincronizar. Los bienes de la v4 llegan sin `asset_id` (`features/import/v4.ts:211`), así que pueden contarse dos veces (`renta.ts:192-194`) |
| Renta ← deudas | ◐ | `liabilities` + `loans` a **hoy**, no al 31 de diciembre. Sin tarjetas (`renta.ts:199`) |
| Renta ← UVT y SMMLV | ◐ | Escritos en el código (`renta.ts:12`, `payroll.ts:10-15`). `ref_uvt` solo la lee Calculadoras; `ref_smmlv` no la lee nadie |
| → contador | ✔ / ◐ | En vivo al abrir (`contador/actions.ts:99-108`), pero entrega el libro completo aunque el permiso sea "renta" y lista adjuntos no visibles (`:131-132`) |

### 2.10 Notificaciones

**Tipos de aviso que existen** (`lib/domain/agenda.ts:102-167`, `lib/notify/rules.ts`):

| Clave | Fuente | Canales | Preferencia en Alertas |
|---|---|---|---|
| `pagos` (`p:`) | fijos, cuotas de Le debo, pago mínimo de tarjeta, suscripciones, `calendar_events` | campana, correo, Telegram, push, WhatsApp | ✔ |
| empeños (`pr:`) | `loans.prenda.limite` | igual que pagos | ✘ (ignora `nf.pagos`) |
| `cobros` (`c:`) | Me deben (próxima cuota) | los 5 | ✔ |
| `hormiga` (`h:`) | proyección vs. `settings.limite` | los 5 | ✔ |
| `presupuesto` (`b:`) | `categories.tope` × `alerta_pres` | los 5 | ✔ |
| `inversiones` (`i:`) | vencimiento a 10 días o menos | los 5 | ✔ |
| `metas` (`m:`) | fecha a 30 días o menos | los 5 | ✔ |
| `automatizacion` | acciones "aviso" e "ia" (`lib/automations/notify.ts:18-68`) | campana + "todos" | ✘ (ignora la matriz, la hora y "nunca") |
| `plan`, `sistema`, `opinion`, `hogar` | pagos y vencimientos, anuncios, opiniones, traspasos | solo campana | ✘ |
| `logro`, `contador` | — | ícono en `notifications-sheet.tsx:23`, pero **nadie los inserta** | ✘ |

**Cómo funciona el motor:**
- **Cron:** Vercel corre a diario `0 11 * * *` (6 a. m. en Bogotá) con `?daily=1`. **`cron.job` está vacío** (consulta a la base): `mirai_schedule_notify` (`20261031001000_notify.sql:14-22`) nunca se ejecutó y `docs/BACKLOG.md:9` lo tiene pendiente.
- **Hora del usuario:** con `daily=1`, `runRule` se salta la condición `h < rule.hora` (`digest.ts:189`) y marca `last_sent`. Todos los resúmenes salen a las 6 a. m. y la hora elegida en Alertas no tiene efecto.
- **Duplicados:** la campana usa `upsert onConflict user_id,dedupe` (`digest.ts:172-173`). Los demás canales usan `last_sent[canal]`. `notification_log` es solo de auditoría (`lib/notify/log.ts`). `notification_outbox` (`core.sql:733`) **no se usa**.
- **Fallos:** cuando un canal no está listo, no marca `last_sent` y registra "fallido" en cada pasada (`digest.ts:151-153,194-198`).
- **Interruptores:** la interfaz da por encendido un tipo si `notif[k] !== false` (`alerts.tsx:156`), pero el dominio exige `=== true` (`agenda.ts:110,115,119…`). Un libro sin la clave se ve encendido y no avisa.
- **Choque con las automatizaciones:** "recordatorio-pagos" con `canales:"todos"` (`templates.ts:45`) y "presupuesto-80" **duplican** los avisos pagos y presupuesto, fuera de la matriz y de la hora.
- **Registro:** los envíos de las automatizaciones no pasan por `logSend` (`lib/automations/notify.ts:63-65`).

**Módulos que no generan avisos y deberían:**
- corte de tarjeta
- fecha DIAN por cédula
- primas y cesantías (solo como evento de calendario agregado a mano)
- mesadas por entregar (`allowances.frec`)
- saldos de compartidos ("te deben en el grupo")
- proveedores (el pago próximo ya lo cubren los fijos y suscripciones)
- logros y nivel
- cobro automático al deudor por WhatsApp (opcional, con plantilla)
- vencimiento o pago del plan por correo (hoy solo campana: `lib/payments/reminders.ts`, `apply.ts:28-32`)

### 2.11 Inteligencia artificial

- **Orden de cada llamada** en `run()` (`lib/ai/run.ts:87-147`): plan → `ia.on` → prompt → caché (`ai_cache`) → cupo → límite por hora → proveedores con respaldo → `ai_usage`. ✔
- **Router sin IA** (`lib/ai/router.ts`): hormiga, `quickAnswer` (cuánto gasté, debo, me deben, gano, suscripciones, fijos, disponible, metas), `interpConfiable`, `mailMayBePurchase`. ✔
- **Contexto del chat** (`features/chat/server.ts:18-40` + `finCtx`):
  - ✔ Entran: ingreso (solo `incomes`), gasto por categoría, fijos, cuotas, suscripciones, hormiga, disponible, fondo, deudas, lo que te deben y metas.
  - ✘ No entran al prompt base: `extra_incomes`, `liabilities`, la deuda de tarjetas (solo su número), los topes y presupuestos, y los activos uno por uno. Las herramientas leen bajo demanda gastos, tarjetas, deudas, metas y próximos pagos (`lib/chat/tools.ts:47-114`).
- **Escritura con confirmación** (`ConfirmCard`, `features/chat/cards.tsx:27-79`; `chatConfirm` con `requireRole("editor")`, `features/chat/actions.ts:63-101`):
  - ✔ gasto, ingreso extra, meta y recordatorio.
  - ✘ préstamo o deuda, pago de cuota, fijo, pagar un fijo, suscripción, compra con tarjeta, abono a meta, fondo, activo e inversión. Tampoco puede editar ni borrar.
- **Categorización:** ✘ el chat usa el nombre que dio el modelo o las reglas locales, sin `classifyExpenses`. Además guarda `cat_src:"regla"` aunque haya elegido la IA (`chat/actions.ts:86`).
- **Interruptor "Consejero IA"** (`features/settings/tabs/ia.tsx:22`): ✘ nadie lo lee.
- **`feature` en `ai_usage`:** ✘ el paso "ia" de las automatizaciones no pasa `feature` ni `userId` (`lib/automations/server.ts:110-114`) y cae en "otro".

### 2.12 Automatizaciones

- **Eventos encolados:** solo INSERT en `expenses`, `extra_incomes` y `fixed_expense_payments` (`automatizaciones.sql:165-169`). Se excluyen los que tienen `external_id` `'auto:%'`.
- **Disparadores por estado** (`detect.ts:89-132`): presupuesto, pago próximo (fijo, tarjeta, cuota, suscripción; **no** cobros ni calendario), saldo bajo (sobre `assets`, que es manual), meta alcanzada e ingreso de nómina.
- **Acciones reales** (`server.ts:66-121`): aviso, movimiento, apartar, categorizar, marcar hormiga, agenda, esperar e IA.
- **Faltan como disparador:**
  - pago y cobro de cuotas (`loan_payments`), cuota vencida de Me deben
  - compra con tarjeta y su corte
  - suscripción nueva o cobrada
  - inversión que vence, `calendar_events` y fechas DIAN
  - mesadas, compartidos, logros y metas por fecha
  - cualquier UPDATE
- **Faltan como acción:** marcar un fijo o una cuota como pagada, crear un ingreso, cobrar por WhatsApp, sincronizar con Google Calendar y avisar solo a una persona (hoy siempre avisa a todo el hogar, `notify.ts:20-21`).
- **Plan:** si el hogar baja a Gratis, las automatizaciones que ya estaban activas siguen corriendo (`automation_limit` solo actúa en INSERT o UPDATE de `activo`).

### 2.13 Integraciones de API

| Integración | Ámbito | La usan | Estado |
|---|---|---|---|
| IA (gateway, Gemini, Groq, OpenRouter, Anthropic, OpenAI) | hogar + plataforma | `lib/ai/model.ts`, `run.ts` | ✔ |
| Correo (Resend, Brevo, SendGrid, Gmail, SMTP) | plataforma | digest, automatizaciones, contador, invitaciones, cuenta | ✔ |
| Telegram, WhatsApp, webpush | plataforma | digest, automatizaciones | ✔ (push sin revisar el plan) |
| TRM, usura, festivos, FX | "household" en el registro, pero de plataforma en la práctica | Cron directo (`refresh.ts:16-37`): **no** consulta `getIntegration`, así que apagarlas en la consola no detiene el cron | ◐ |
| `ref_holidays` | — | Se llena y **nadie la lee** (el día hábil siguiente no se aplica en ningún lado) | ✘ |
| CoinGecko, stocks | registradas | Solo la prueba de la consola (`admin/server.ts:480-490`). Inversiones no actualiza precios | ✘ |
| Google Gmail | plataforma | `scanMail` lee 40 `snippet`. No vuelve a revisar `getIntegration` al escanear | ◐ |
| Google Calendar | plataforma | `syncCalendar` manual, solo POST | ◐ |
| Mercado Pago, Wompi | variables de entorno (fuera del registro) | webhooks con firma ✔. `applyPayment` lee y luego escribe (`lib/payments/apply.ts:44-72`): dos webhooks a la vez pueden extender el plan dos veces. El reembolso no revoca el plan. En Mercado Pago recurrente, el cupón suma un uso por cada cobro. Mercado Pago no valida el monto. Ninguna firma revisa que el `ts` sea reciente. No hay correo al pagar, fallar o vencer | ◐ |
| Turnstile, Sentry, AdSense | registradas | Leen variables de entorno o la tabla directa, no `getIntegration` | ◐ (cosmético) |

### 2.14 Realtime e invalidación

- **Publicación `supabase_realtime`** (consulta a la base): incluye las 40 tablas de `LIVE_TABLES` (`hooks/use-realtime.ts:10-18`), más `automation_events` (la escucha el runner), `notifications` (canal propio), `books`, `family_members` y `household_members`. Estas tres últimas **no** están en `LIVE_TABLES`. ◐
- **Invalidación por tabla** (`hooks/use-book-data.ts:16-58`): ✔ partes del libro y derivadas (`setup-progress`, `search-index`, `renta`). Los cambios que hace el servidor en otras tablas (por ejemplo `pay_fixed_expense` escribe `expenses` y `goals`) llegan por Realtime, porque el filtro de eco es por (tabla, id).
- **`search-index`:** depende de `entities` (`use-book-data.ts:20`), pero no la consulta (`command-palette.tsx:51-53`). Tampoco depende de `providers`, `subscriptions`, `goals` ni `credit_cards`.
- **`profile-counts`** (`features/profile/profile-view.tsx:93`) no está en `DERIVED_DEPS`: solo se refresca con la invalidación amplia `["b", bookId]`.
- **Tablas fuera de la publicación** que cambian la interfaz: `gami_state`, `gami_missions`, `gami_visits`, `monthly_summaries`, `chat_*` y `notification_rules`. Son aceptables, porque las escribe el mismo usuario.

### 2.15 Búsqueda ⌘K, Agregar, campana y Centro de ayuda

| Pieza | Cubre | Falta |
|---|---|---|
| ⌘K (`components/app/command-palette.tsx:37-58`) | todas las páginas (`PAGES`, incluidas las pestañas), contactos, préstamos, fijos | gastos, proveedores, suscripciones, tarjetas, metas, entidades, inversiones, deseos |
| Agregar (`components/app/add-menu.tsx:10-17`) | gasto, fijo, ingreso, préstamo que hice, deuda, contacto, inversión, meta | suscripción, compra con tarjeta, pago de tarjeta, abono a meta o fondo, ingreso extra, recordatorio o evento fiscal, proveedor, cuenta o activo |
| Campana (`notifications-sheet.tsx`) | los tipos de §2.10 | `automatizacion` sin ícono ni tono (`:23-25`); `logro` y `contador` sin productor |
| Centro de ayuda (`lib/content/{centro-ayuda,ayuda,academia,glosario}.ts`) | HELP y MDESC en todas las secciones (`lib/content/help.ts` + `legacy-help.json`) | Ningún enlace a la ruta (`/id`) en el contenido de ayuda para: puesta, dashboard, consejero, proveedores, correo, importar, me-deben, contactos, retos, logros, familia, mesadas, compartidos, deseos, contador, indicadores, reportes, automatizaciones, suscripciones (heurística por texto; ¿? revisar si se enlazan de otra forma) |

---

## 3. Matriz de conexiones (resumen)

Filas: lo que pasa. Columnas: lo que debería cambiar.

| ↓ origen / destino → | Cuenta o activo | Presupuesto | Flujo, Balance y Dashboard | Patrimonio | Avisos | Agenda y Calendar | Renta | IA (contexto) | Automat. | Logros |
|---|---|---|---|---|---|---|---|---|---|---|
| Gasto | ✘ | ✔ | ✔ | — | ◐ | — | ✘ deducible | ✔ | ✔ insert | ✔ |
| Ingreso (plantilla) | ✘ | ◐ | ✔ | — | — | — | ◐ | ◐ | ✘ | ✔ |
| Ingreso extra | ✘ | — | ✔ | — | — | — | ✘ | ✘ | ✔ | — |
| Pago de fijo | ✘ | ✔ | ✔ | ✔ (meta y fondo) | ✔ | ◐ manual | — | ✔ | ✔ | ✔ |
| Suscripción cobrada | ✘ | ✔ | ◐ por nombre | — | ✔ | ◐ manual | — | ✔ | ✔ (como gasto) | — |
| Compra con tarjeta | — (deuda ✔) | ✔ | ✔ | ✔ | ◐ (sin corte) | ◐ | ✔ topes / ✘ patrimonio | ◐ (solo número) | ✔ (gasto) | — |
| Pago de tarjeta | ✘ no existe | — | ◐ estimado | ◐ | — | — | — | — | ✘ | — |
| Cuota de Le debo | ✘ | — | ✔ | ✔ | ✔ | ◐ manual | ◐ a hoy | ✔ | ✘ | ✔ |
| Cobro de Me deben | ✘ | — | ✔ | ✔ | ◐ | ◐ manual | ◐ | ✔ | ✘ | — |
| Abono a meta | ✘ | — | ✘ | ✘ | — | — | — | ✔ | ✘ | ✔ |
| Fondo de emergencia | ✘ | — | ✔ | ✘ | — | — | — | ✔ | ◐ | ✔ |
| Inversión | ✘ | — | ✔ | ✔ | ◐ | — | ✔ | ◐ | ✘ | ✔ |
| Mesada | ✘ | — | ✔ | — | ✘ | — | — | ✘ | ✘ | — |
| Compartido | ✘ | ✔ (gasto) | ✔ | ✘ "te deben" | ✘ | — | — | ✘ | ✔ (gasto) | — |
| Evento fiscal | — | — | ✔ | ✔ (causados) | ◐ | ◐ | ✔ | ✔ (tool) | ✘ | — |
| Bien o activo | (es la cuenta) | — | — | ✔ | ✘ saldo bajo solo con automat. | — | ◐ copia | ◐ | ◐ | — |
| Cambio de plan | — | — | — | — | ◐ solo campana | — | — | ✔ bloqueo | ◐ | — |

---

## 4. Brechas priorizadas

> **Regla de oro para la base compartida con producción:** toda migración es **aditiva**: columnas nulas, tablas nuevas, funciones nuevas o reemplazos que mantienen la firma. Lo que cambia el comportamiento de la versión publicada (cascadas nuevas, bloqueos por plan en la RLS) va detrás de un interruptor, apagado por defecto, que se enciende solo cuando `main` tenga el código que lo entiende. Ese interruptor es una **columna booleana nueva** en `platform_settings`: la tabla es de una sola fila con columnas como `limites_db` y `registro_abierto`, no de clave y valor.

### P0: datos inconsistentes o rotos

| # | Brecha | Impacto para el usuario | Archivos | Propuesta |
|---|---|---|---|---|
| P0-1 | Borrar o editar un gasto `origen=tarjeta` no toca la compra; borrar la tarjeta deja los gastos ligados | La deuda de la tarjeta y el gasto no cuadran: se ve deuda de algo "borrado" o un gasto de una compra que ya no existe | `features/cards/*`, migración nueva | Trigger `expense_card_sync` (AFTER UPDATE OF deleted_at, valor, fecha, category_id ON expenses WHEN origen='tarjeta') que refleje el cambio en `card_purchases` por `expense_id`, y su inverso en `card_purchases`. Detrás de `platform_settings.sync_enlaces` (nuevo, false). Además: editar y borrar compras sueltas en la tarjeta, y borrar la tarjeta con sus gastos ligados |
| P0-2 | Borrar un gasto de grupo (`shared_group_expenses`) no borra el `expenses` ligado (`compartidos-view.tsx:110-115,157`) | El gasto sigue contando en presupuesto y flujo | migración, `features/extras/compartidos-view.tsx` | Igual que P0-1: trigger `shared_expense_sync` con el mismo interruptor |
| P0-3 | Editar el valor o la fecha de un gasto que salió de pagar un fijo no actualiza `fixed_expense_payments` (`fixed_pay.sql:66-91`) | Gastos y Flujo o Balance muestran cifras distintas para el mismo pago | migración (`create or replace function expense_fixed_sync`, con la misma firma) | Agregar la rama `old.valor<>new.valor or old.fecha<>new.fecha` que actualice el pago y el aporte (`goals.ahorrado` o `emergency_funds.saldo` por la diferencia). Es aditivo: hoy esa rama no hace nada |
| P0-4 | Abono directo a meta: lee y luego escribe, sin movimiento (`goals-view.tsx:102`) | Un abono se puede perder si dos personas abonan a la vez. No aparece en "Ahorras". No se puede deshacer | migración: tabla `goal_movements` + RPC `goal_contribute(goal, valor, fecha, nota, medio)`; `features/goals/goals-view.tsx`; `lib/domain/flujo-integral.ts` (`X.metas`) | La RPC hace `update ... set ahorrado = ahorrado + v` y el insert del movimiento en una transacción. El flujo integral los lee como ahorro (como `X.fondo`). La versión publicada sigue funcionando porque `goals.ahorrado` se mantiene |
| P0-5 | Fondo de emergencia: Metas usa `ef.saldo` y el Dashboard usa `liquidez` (`goals-view.tsx:91-94` vs. `dashboard.ts:108-118`) | "Te faltan X para tu fondo" distinto en cada pantalla | `lib/domain/dashboard.ts`, `lib/domain/savings.ts`, `features/dashboard/dashboard-view.tsx`, `features/goals/goals-view.tsx` | Función pura `fondoDisponible(fund, liquidez)` en `savings.ts`, usada por las dos pantallas. Pasar `fund` a `capacidad()` (ya viaja en `finCtx`) |
| P0-6 | "Ya se cobró" (suscripción) hace dos escrituras sin transacción, sin enlace, y "Deshacer" no devuelve `proximo` (`subscriptions-view.tsx:50-60`) | Si falla la segunda, el cobro queda doble o el próximo no avanza. Borrar el gasto deja la suscripción adelantada | migración: `expenses.subscription_id uuid null` + RPC `pay_subscription(sub, fecha, valor, medio)` + trigger de reversa; `features/subscriptions/*`; regla 4 de `flujo-integral.ts` (emparejar por `subscription_id` y, si no hay, por nombre) | La columna nula no afecta a la versión publicada. El emparejamiento por nombre se mantiene como respaldo |
| P0-7 | Compra con tarjeta: dos escrituras sin transacción (`card-forms.tsx:107-115`); con el correo o importar, la compra con tarjeta queda como gasto de caja (`correo-view.tsx:80`, `import-view.tsx:125`) | Gasto huérfano. La deuda de la tarjeta no sube. El flujo cuenta como salida inmediata algo que se paga en el corte | RPC `add_card_purchase(card, …, como_gasto)`; `features/cards/card-forms.tsx`; `features/correo/correo-view.tsx`; `features/import/import-view.tsx` | En correo e importar: selector "¿Con qué pagaste?" (medio o tarjeta). Si es una tarjeta, se crea la compra con la RPC. Correo: `payment_method_id`, `member_id`, `currency` |
| P0-8 | Límite de automatizaciones: la app y la base no coinciden (`limits.ts:9-13` vs. `automatizaciones.sql:118`) | Con un plan creado en la consola, la interfaz deja activar y la base lo rechaza con un error críptico | `lib/automations/limits.ts`, migración (`automation_limit` leyendo `plans.limites->>'automatizaciones'`) | Una sola regla: un límite de la tabla `plans` nulo = sin límite, en los dos lados. Prueba Vitest de `activeLimit` con un plan personalizado |
| P0-9 | `applyPayment` lee y luego escribe (`lib/payments/apply.ts:44-72`); el cupón suma usos en cada renovación; el reembolso no revoca | El plan se puede extender dos veces; las métricas de cupones salen mal; un reembolso deja Premium activo | `lib/payments/apply.ts`, migración: RPC `apply_plan_payment(...)` con `for update` | Mover la lógica a una función SQL transaccional e idempotente (`on conflict … do update … returning (xmax=0)`). Sumar uso del cupón solo en el primer pago de la suscripción. `reembolsado` resta el periodo |
| P0-10 | `agenda()` ignora `calendar_events.anual` (`agenda.ts:66-71`; `cashflow.ts:50,55`) | Los recordatorios de una sola vez se repiten cada año, también en avisos y Flujo de caja | `lib/domain/agenda.ts`, `lib/domain/cashflow.ts`, `lib/domain/types.ts:142` | Usar la misma regla de `features/agenda/events.ts:67` (`nextOcc`). Llevarla a `lib/domain/dates.ts` y usarla en los tres lugares |
| P0-11 | Interruptores de aviso: la interfaz usa `!== false` y el dominio `=== true` (`alerts.tsx:156` vs. `agenda.ts:110…`) | Un aviso se ve encendido y no llega | `lib/domain/agenda.ts` | Una sola función `avisoOn(nf, k)` con valor por defecto `true` para pagos y cobros y la matriz de `rules.ts:27-31` |

### P1: enlace que el usuario espera y no está

| # | Brecha | Archivos | Propuesta |
|---|---|---|---|
| P1-1 | **Cuentas con saldo**: el gasto, el ingreso, la cuota, el pago de tarjeta y el aporte no mueven la cuenta | migración: `payment_methods.asset_id uuid null`, `assets.saldo_base numeric null`, `assets.saldo_fecha date null`, `extra_incomes.payment_method_id`, `incomes.payment_method_id`, `loan_payments.payment_method_id`; `lib/domain/cuentas.ts` (nuevo); Balance; Ajustes › Catálogos | Saldo **calculado**, sin triggers sobre `assets.valor` para no romper la versión publicada: `saldoCuenta(asset, libro) = saldo_base + entradas − salidas desde saldo_fecha` por los medios ligados a esa cuenta, usando los movimientos "hecho" de `flujoIntegral`. Solo aplica a las cuentas con `saldo_base` no nulo; las demás siguen con el valor manual. Botón "Cuadrar con mi banco" que reinicia la base |
| P1-2 | **Pago de tarjeta** como movimiento real | migración: tabla `card_payments(card_id, fecha, valor, payment_method_id)`; `lib/domain/cards.ts`; `features/cards/*` | "Pagar la tarjeta" (mínimo, total u otro valor). `compraEstado` aplica los pagos. El flujo usa el pago real si existe y si no, la estimación |
| P1-3 | **Programar el cron horario** (pg_cron vacío) y respetar la hora del usuario | `docs/DEPLOY-VERCEL.md`, `lib/notify/digest.ts:189`, `app/api/cron/notify/route.ts` | Ejecutar `select mirai_schedule_notify(url, secreto)` en pruebas y en producción (es la misma base: programarlo **una sola vez**, contra la URL de producción). La pasada `daily` envía solo a quien tenga `hora <= 6` o cuando no hay cron horario (detectarlo con `cron.job`, o con `platform_settings.cron_horario`) |
| P1-4 | **Aviso de corte de tarjeta** y "tu tarjeta pasó el 30 % del cupo" | `lib/domain/agenda.ts` | Ítem `k:"corte"` con `proxDia(corte)`. Uso del cupo en `notifs` |
| P1-5 | **Fecha DIAN automática** por `profiles.digitos` + `ref_renta_calendar` | `lib/domain/agenda.ts` (recibe `vencimientosDian`), `lib/notify/digest.ts`, `features/agenda/fiscal.ts` | Inyectar las fechas como eventos virtuales `cal:dian:y`. No escribe en la base |
| P1-6 | Eventos de ingreso (prima, cesantías) salen como "Pago… ten listos" | `lib/domain/agenda.ts:115-117` | Si `dir==="cobrar"` y `k==="cal"`, texto de "Te llega" bajo el aviso `cobros` |
| P1-7 | Estrategia de deudas sin tarjetas ni pasivos | `lib/domain/debt-strategy.ts`, `features/strategy/strategy-view.tsx` | `debtsFrom` acepta tarjetas (saldo, tasa mensual, pago mínimo) |
| P1-8 | Renta: deuda de tarjetas, `incomes.deducciones`, `extra_incomes` y saldos al 31 de diciembre | `lib/domain/renta.ts`, `features/renta/data.ts` | Sumar `tarjetasDeuda` a `deudas`. Usar las retenciones guardadas cuando existan (modo manual). Calcular `loanEngine(L, '${y}-12-31')` |
| P1-9 | Marca "deducible" en gastos (salud prepagada, educación, intereses de vivienda, dependientes) | migración: `expenses.deducible text null`; `features/expenses/expense-form.tsx`; `lib/domain/renta.ts` | La renta propone `tax_years.ded` desde los gastos marcados del año. Hoy se escriben a mano |
| P1-10 | Bloqueo Premium en el servidor (impuestos, familia, importar, contador) | `features/contador/actions.ts:59-131`, migración: políticas RLS con `household_can(h,'impuestos')` detrás de `platform_settings.premium_db` (false) | Portal del contador: revisar el plan en `contadorOpen`. Las RLS nuevas solo se activan con el interruptor. Usar `requirePremium` donde ya hay Server Actions |
| P1-11 | Chat: crear préstamo o deuda, pagar cuota, pagar fijo, suscripción, compra con tarjeta y abono a meta; categorizar con IA; contexto completo; rol fino | `lib/chat/tools.ts`, `features/chat/actions.ts`, `features/chat/cards.tsx`, `app/api/chat/route.ts:66` | Herramientas `proponer_*` nuevas con la misma `ConfirmCard`. `chatConfirm` usa las RPC de P0-4, P0-6 y P1-2. `resolveCategory` → `classifyExpenses` cuando las reglas no estén seguras. `canEdit = can(access,'registrar')`. Agregar al contexto la deuda de tarjetas, los pasivos, los ingresos extra y los topes |
| P1-12 | Automatizaciones: eventos de `loan_payments`, `card_purchases`, `subscriptions` (UPDATE de `proximo`) y `calendar_events`; acciones "marcar fijo pagado", "crear ingreso" y "avisar a una persona" | migración (más `create trigger … automation_enqueue`), `lib/automations/{catalog,types,server,detect}.ts` | `automation_enqueue` ya es genérico: solo hay que agregar los triggers. Las plantillas nuevas vienen **inactivas** |
| P1-13 | Plantillas de automatización que duplican avisos (`templates.ts:26,42,45,50`) | `lib/automations/templates.ts`, `lib/automations/notify.ts` | Que "recordatorio-pagos" y "presupuesto-80" no vengan activas, o que respeten la matriz y la hora (`onFor`, `enSilencio`) y queden en `notification_log` |
| P1-14 | Google Calendar automático y con actualización | `features/correo/actions.ts:71-91` → `lib/google-calendar.ts` (nuevo), cron | Sincronizar en el cron diario a quien conectó Calendar. Guardar `google_event_map(book_id, key, event_id, hash)` (tabla nueva) para usar PATCH o DELETE cuando cambie el monto o la fecha o el registro se pague o se borre |
| P1-15 | Cobro al deudor (Me deben) por WhatsApp con plantilla, opcional | `lib/notify/wa-templates.ts`, `features/loans/reminder-dialog.tsx`, acción de automatización | Plantilla aprobada por Meta "recordatorio de pago a tercero". Solo con el consentimiento del usuario y su número verificado. Registro en `notification_log` |
| P1-16 | Correo al usuario cuando el plan se paga, falla o está por vencer | `lib/payments/{apply,reminders}.ts`, `lib/notify/email-kinds.ts` | `EMAIL_KINDS.plan`, con `logSend` |
| P1-17 | Patrimonio mes a mes desde el cron | `app/api/cron/notify/route.ts`, `lib/domain/flujo-integral.ts` (`estadoIntegral`) | Guardar `net_worth_snapshots` el día 1 de cada mes en el servidor (`upsert` por `book_id,mes`). `patrimonio-card.tsx` se mantiene |
| P1-18 | Gasto suelto que coincide con un fijo pendiente (por ejemplo, el arriendo que llegó por el correo) | `lib/domain/fixed.ts` (`sugerirPagoFijo`), `features/expenses/*` | Al guardar, si `descripcion` o `provider_id` y el valor coinciden con un periodo pendiente: "¿Es el pago de Arriendo de noviembre?" → enlaza (`fixed_expense_id` + pago) |

### P2: mejoras

| # | Brecha | Archivos | Propuesta |
|---|---|---|---|
| P2-1 | Cuatro motores de cálculo (Inicio, Flujo de caja, Dashboard, chat) | `features/home/home-view.tsx`, `features/planning/cashflow-view.tsx`, `lib/domain/cashflow.ts`, `lib/domain/advisor.ts` (`finCtx`) | Llevar "cuánto me queda", ingresos y compromisos a `flujoIntegral` y `compromisos()`. Pruebas Vitest de coherencia: mismo libro, mismo resultado en las cuatro funciones |
| P2-2 | ⌘K sin gastos, proveedores, suscripciones, tarjetas, metas ni entidades | `components/app/command-palette.tsx`, `hooks/use-book-data.ts:20` | Ampliar el índice y `DERIVED_DEPS["search-index"]` |
| P2-3 | Agregar sin suscripción, compra o pago de tarjeta, abono a meta, ingreso extra, recordatorio, proveedor ni cuenta | `components/app/add-menu.tsx` | Agregar esas entradas con su `?nuevo=` correspondiente (las vistas lo leen) |
| P2-4 | Campana: `automatizacion` sin ícono; `logro` sin productor | `components/app/notifications-sheet.tsx:23-25`, `features/gami/gami-check.tsx` | Ícono y tono. Insertar `kind:"logro"` al desbloquear una insignia |
| P2-5 | Retos y deseos no alimentan metas | `features/extras/retos-view.tsx`, `features/deseos/deseos-view.tsx` | "Llevar lo ahorrado a una meta" (RPC `goal_contribute`). "Convertir en meta" desde un deseo, y "Preguntar al consejero" |
| P2-6 | Mesadas y compartidos sin avisos; compartidos sin "te deben" en el patrimonio | `lib/domain/agenda.ts`, `lib/domain/shared.ts`, `flujo-integral.ts` | Aviso "toca la mesada de X" y saldo neto del grupo en "Tengo" o "Debo" |
| P2-7 | `ref_holidays`, `ref_smmlv`, `ref_uvt` y `ref_rates` casi sin uso; UVT y SMMLV en el código | `lib/domain/payroll.ts:10-15`, `renta.ts:12`, `book-data.ts` | Cargar las `ref_*` en `SettingsIn` (con las constantes del código como respaldo) y aplicar el día hábil siguiente en fijos y DIAN |
| P2-8 | El cron de datos de referencia no respeta `getIntegration`; CoinGecko y stocks sin uso | `features/integrations/refresh.ts` | Revisar `resolvePlatformOnly`. Actualizar `investments.actual` por `symbol` si la integración está activa |
| P2-9 | Importar: sin `external_id` (el índice no protege) y los abonos van como gastos | `features/import/import-view.tsx`, `lib/domain/csv.ts` | `external_id = 'csv:'+hash(fecha,desc,valor,n)`. Abonos → `extra_incomes`. `detectSubs` al terminar |
| P2-10 | Prueba de integración de IA fuera de `run()` | `features/integrations/actions.ts:76` | Usar `aiText({ feature: "prueba" })` solo con claves del hogar |
| P2-11 | Interruptor "Consejero IA" sin efecto; automatizaciones sin `feature` | `features/advisor/engine.ts`, `app/api/chat/route.ts`, `lib/automations/server.ts:110` | Leer `ia.consejero`; pasar `feature:"automatizacion"` y `userId` |
| P2-12 | `family_members`/`household_members` fuera de `LIVE_TABLES` | `hooks/use-realtime.ts` | Canal por `household_id` |
| P2-13 | Preferencias de aviso por libro y no por persona | `features/settings/prefs.ts:42`, `lib/notify/digest.ts` | Mover el interruptor por tipo a `notification_rules` (por usuario y libro), con `book_settings.notif` como valor por defecto |
| P2-14 | Contador: entrega el libro completo y adjuntos no visibles | `features/contador/actions.ts:106,131` | Filtrar a lo que necesita la renta y `visible_contador` |

---

## 5. Frentes de trabajo en paralelo

Cada frente edita **archivos distintos**. Cuando dos frentes se tocan, el contrato va escrito al final de cada uno. Las migraciones son archivos nuevos e independientes, con un prefijo de hora distinto por frente: F1 `…3000`, F2 `…3100`, F3 `…3200`, F4 `…3300`, F5 `…3400`, F6 `…3500`.

### F1: Cuentas, ahorro y patrimonio ("el libro mayor")

**Archivos:**
- `lib/domain/cuentas.ts` (nuevo), `lib/domain/totals.ts`, `lib/domain/flujo-integral.ts`, `lib/domain/dashboard.ts`, `lib/domain/savings.ts`
- `features/balance/*`, `features/dashboard/*`, `features/goals/*`, `features/patrimonio/*`
- `features/settings/tabs/catalogs.tsx` (medio → cuenta; **ojo: hoy tiene cambios sin confirmar**)
- `lib/book-data.ts`
- migración `…3000_cuentas_metas.sql`

**Tareas:**
- **P0-4:** `goal_movements` + `goal_contribute`, y el abono a meta con "Deshacer"
- **P0-5:** `fondoDisponible` común para Metas y Dashboard
- **P1-1:** `payment_methods.asset_id`, `assets.saldo_base/saldo_fecha` y `saldoCuenta()`; la "Dinero en cuentas" del Balance muestra el saldo calculado con su "Cuadrar"
- **P1-17:** foto mensual del patrimonio (solo la función pura `snapshotMes(libro)`; la llamada desde el cron va en F3)
- **P2-1:** que Inicio, Flujo de caja y `finCtx` usen `flujoIntegral`/`compromisos`
- Metas y fondo como "Ahorro apartado" en el estado (sin duplicar si la cuenta ya lo incluye: opción "esta plata está en la cuenta X")

**Contrato con F2:** F1 lee `extra_incomes.payment_method_id`, `loan_payments.payment_method_id`, `card_payments` y `expenses.subscription_id` como **opcionales** (si no existen o vienen nulos, se ignoran).

**Terminado cuando:**
- Vitest de `cuentas.test.ts`: saldo con base + gastos + ingresos + cuota + pago de tarjeta, sin contar dos veces un pago de fijo ni una compra con tarjeta.
- Vitest de `savings.test.ts`: `fondoDisponible`.
- Vitest de coherencia `dashboard.test.ts` ↔ `goals`.
- Vitest de coherencia entre motores (P2-1).
- E2E `f21-cuentas.spec.ts`: ligar el medio "Nequi" a la cuenta "Nequi" con saldo $500.000 → gasto de $50.000 → Balance muestra $450.000 → borrar el gasto → $500.000.
- E2E: abono a meta → "Ahorras" del Dashboard sube → Deshacer.

### F2: Movimientos enlazados (tarjetas, suscripciones, compartidos, préstamos y entradas automáticas)

**Archivos:**
- `features/cards/*`, `lib/domain/cards.ts`
- `features/subscriptions/*`, `lib/domain/subscriptions.ts`
- `features/extras/compartidos-view.tsx`
- `features/loans/pay-loan-dialog.tsx`
- `features/correo/correo-view.tsx`, `features/import/import-view.tsx`, `lib/domain/csv.ts`
- `lib/domain/fixed.ts`, `features/expenses/expense-form.tsx` (solo la sugerencia de P1-18)
- migración `…3100_enlaces.sql` (triggers de sincronización + `platform_settings.sync_enlaces`, RPC `add_card_purchase`, `pay_subscription`, `card_payments`, `expenses.subscription_id`, `loan_payments.payment_method_id`, `extra_incomes.payment_method_id`, `expense_fixed_sync` v2)

**Tareas:**
- **P0-1, P0-2:** triggers de cascada detrás del interruptor
- **P0-3:** `expense_fixed_sync` v2 (valor y fecha)
- **P0-6:** `pay_subscription` con su reversa
- **P0-7:** `add_card_purchase`, y "¿Con qué pagaste?" en correo e importar
- **P1-2:** `card_payments` + "Pagar la tarjeta"; editar y borrar compras sueltas
- **P1-18:** sugerir que un gasto suelto es el pago de un fijo
- **P2-9:** `external_id` en importar; abonos → `extra_incomes`
- Medio de pago en el pago de cuotas e ingresos extra

**Terminado cuando:**
- Vitest de `cards.test.ts` con pagos reales.
- Vitest de `subscriptions.test.ts` (emparejar por `subscription_id`).
- Vitest de `csv.test.ts` (`external_id` estable).
- E2E `f1-tarjetas.spec.ts` ampliada: compra → borrar el gasto en Gastos → la deuda baja (con el interruptor encendido en pruebas); pagar la tarjeta → la deuda baja y aparece en el flujo.
- E2E `f1-suscripciones.spec.ts`: Ya se cobró → Deshacer → `proximo` vuelve.
- E2E `f3-extras.spec.ts`: borrar un gasto de grupo → desaparece de Gastos.
- E2E `f1-fijos.spec.ts`: editar el valor del gasto del fijo → el Flujo muestra el nuevo valor.

### F3: Avisos, agenda y calendarios

**Archivos:**
- `lib/domain/agenda.ts`, `lib/domain/dates.ts` (`nextOcc`), `lib/domain/cashflow.ts` (solo `anual`), `lib/domain/types.ts`
- `lib/notify/*`, `app/api/cron/notify/route.ts`, `features/settings/tabs/alerts.tsx`, `features/settings/prefs.ts`
- `features/agenda/*`, `features/correo/actions.ts` (`syncCalendar` → `lib/google-calendar.ts` nuevo)
- `components/app/notifications-sheet.tsx`, `features/loans/reminder-dialog.tsx`
- `lib/payments/reminders.ts` (solo el correo), `docs/DEPLOY-VERCEL.md`
- migración `…3200_avisos.sql` (`google_event_map`, `platform_settings.cron_horario`)

**Tareas:**
- **P0-10:** `anual` en agenda y flujo clásico
- **P0-11:** `avisoOn` común
- **P1-3:** activar pg_cron una sola vez, contra producción, y respetar la hora
- **P1-4:** aviso de corte y de uso del cupo
- **P1-5:** fechas DIAN por cédula
- **P1-6:** textos de eventos de ingreso
- **P1-14:** Calendar automático con PATCH y DELETE
- **P1-15:** cobro por WhatsApp opcional
- **P1-16:** correo del plan
- **P1-17:** llamar `snapshotMes` desde el cron (la función pura es de F1)
- **P2-4, P2-6, P2-13:** íconos de la campana, avisos de mesadas y compartidos, preferencias por persona
- Dedupe con fecha para inversiones y metas
- Empeños con interruptor propio
- `notification_outbox`: borrarla del plan o usarla
- No registrar "fallido" en cada pasada

**Terminado cuando:**
- Vitest de `agenda.test.ts`: evento `anual:false` no se repite; corte de tarjeta; fecha DIAN por dígitos; prima como "te llega".
- Vitest de `rules.test.ts`: `avisoOn`.
- Vitest de `digest`: hora respetada con cron horario.
- E2E `f3-agenda.spec.ts`: recordatorio de una sola vez del año pasado no aparece en Próximos pagos.
- E2E `f4-ajustes.spec.ts`: el aviso que se apaga no llega a la campana.
- Verificación manual: `select jobname, schedule from cron.job` devuelve `mirai-notify | 5 * * * *`.

### F4: IA y chat conectados a todos los módulos

**Archivos:**
- `lib/chat/*`, `app/api/chat/route.ts`, `features/chat/*`
- `lib/ai/*` (solo `features.ts` y `prompts.ts` si hace falta), `features/ai/actions.ts`
- `features/advisor/engine.ts`, `features/settings/tabs/ia.tsx`, `features/integrations/actions.ts`
- `features/home/quick-entry.tsx`

**Tareas:**
- **P1-11:** herramientas `proponer_prestamo`, `proponer_pago_cuota`, `proponer_pago_fijo` (RPC `pay_fixed_expense`), `proponer_suscripcion`, `proponer_compra_tarjeta`, `proponer_abono_meta`; categorizar con `classifyExpenses`; contexto completo; rol fino (`registra`)
- **P2-10:** prueba de integración dentro de `run()`
- **P2-11:** interruptor del consejero
- Revisión de rol en la entrada rápida y categoría con IA cuando `localCat` no esté segura
- Que el viewer no gaste créditos (`requireCan('registrar')` en `classifyExpenses`, `improveCobro`, `primaPlan`, `chatTitle`)

**Contrato:**
- Para abono a meta, compra con tarjeta y cobro de suscripción, `chatConfirm` llama las RPC de F1 y F2: `goal_contribute`, `add_card_purchase`, `pay_subscription`.
- Hasta que existan, esas herramientas quedan detrás de la detección `rpcExists`, o se entregan después de F1 y F2.

**Terminado cuando:**
- Vitest de `lib/chat/tools.test.ts`: cada herramienta valida con zod y no se entrega al viewer.
- Vitest de `router.test.ts`.
- E2E `f14-chat.spec.ts`: "le presté 200 mil a Juan a 3 meses" → tarjeta → Confirmar → aparece en Me deben; "pagué la cuota del carro" → cuota registrada; usuario "registra" puede confirmar un gasto.
- E2E `f4-ia-asistentes.spec.ts`: probar la conexión registra en `ai_usage`.

### F5: Planes, roles, pagos y automatizaciones

**Archivos:**
- `lib/plans.ts`, `lib/plan-server.ts`, `lib/dal.ts` (solo usos de `requirePremium`)
- `features/planes/*`, `features/contador/actions.ts`
- `lib/payments/apply.ts`, `app/api/pagos/*`
- `lib/automations/*`, `features/automations/*`
- `features/household/*` (límites)
- migración `…3400_planes_automat.sql` (`automation_limit` v2, `apply_plan_payment`, RLS de plan detrás de `premium_db`, triggers de `automation_enqueue` para `loan_payments`, `card_purchases`, `subscriptions`, `calendar_events`)

**Tareas:**
- **P0-8:** límite de automatizaciones único
- **P0-9:** pagos transaccionales, cupón y reembolso
- **P1-10:** Premium en el servidor y en el portal del contador
- **P1-12:** nuevos eventos y acciones de automatización
- **P1-13:** plantillas que no dupliquen avisos (con `onFor`/`enSilencio` de `lib/notify/rules.ts`, que solo se **importa**, sin editarlo)
- Automatizaciones que se pausan al bajar a Gratis (cron: si el hogar quedó sobre el límite, solo corren las primeras N)
- Consejero sin la insignia Premium en el menú (`lib/plans.ts:29`)
- Respaldo v4 accesible en Gratis

**Terminado cuando:**
- Vitest de `limits.test.ts` con un plan personalizado.
- Vitest de `apply.test.ts`: dos aprobaciones simultáneas = una extensión; un reembolso revoca.
- Vitest de `engine.test.ts` con los eventos nuevos.
- E2E `f9-planes.spec.ts`: usuario Gratis abre un enlace de contador existente → "no disponible".
- E2E `f12-automatizaciones.spec.ts`: pagar una cuota dispara la automatización "cuota pagada".

### F6: Impuestos, datos de referencia y descubribilidad

**Archivos:**
- `lib/domain/renta.ts`, `features/renta/*`
- `lib/domain/payroll.ts` (constantes → `ref_*`)
- `features/integrations/{refresh,data-sources}.ts`
- `lib/domain/debt-strategy.ts`, `features/strategy/*`
- `components/app/command-palette.tsx`, `components/app/add-menu.tsx`
- `lib/content/centro-ayuda.ts`, `hooks/use-realtime.ts`, `hooks/use-book-data.ts` (solo `DERIVED_DEPS`)
- `features/import/v4.ts` (`asset_id` de bienes)
- migración `…3500_deducibles.sql` (`expenses.deducible`)

**Tareas:**
- **P1-7:** estrategia con tarjetas y pasivos
- **P1-8:** renta con tarjetas, deducciones guardadas, ingresos extra y saldos al 31 de diciembre
- **P1-9:** deducibles (la columna y el cálculo en renta). El campo en `expense-form.tsx` es de F2, que añade un solo selector siguiendo el contrato `deducible: 'salud'|'educacion'|'vivienda'|'dependiente'|null`
- **P2-2, P2-3:** ⌘K y Agregar completos
- **P2-7:** `ref_*` en la configuración del libro
- **P2-8:** cron de referencia con `getIntegration` y precios de inversiones
- **P2-12:** realtime del hogar
- **P2-14:** contador filtrado (solo los datos de `loadRentaData` en `features/renta/data.ts`; las Server Actions del contador son de F5)
- Enlaces del Centro de ayuda a las secciones que no los tienen
- Bienes de la v4 enlazados por nombre a `assets`

**Terminado cuando:**
- Vitest de `renta.test.ts`: patrimonio con tarjeta; retención manual respetada; saldo al 31 de diciembre (comparado con la v4 donde aplique).
- Vitest de `debt-strategy.test.ts` con tarjeta.
- Vitest de `payroll.test.ts`: SMMLV de `ref_smmlv` con respaldo.
- E2E `f5-renta.spec.ts`: gasto marcado como deducible de salud aparece en la depuración.
- E2E `f0-shell.spec.ts`: ⌘K encuentra un proveedor y una meta; Agregar → Suscripción abre el formulario.

### Orden sugerido

1. **F1, F2, F3, F5 y F6 pueden empezar a la vez.**
2. **F4** arranca con lo que no depende de nadie (préstamo, pago de cuota, pago de fijo, rol, categorización, contexto) y suma las herramientas de meta, tarjeta y suscripción cuando F1 y F2 publiquen sus RPC.
3. Antes de hacer merge a `main`, cada interruptor nuevo (`sync_enlaces`, `premium_db`, `cron_horario`) se enciende **solo en pruebas** y se verifica que la versión publicada sigue funcionando con la base compartida.
